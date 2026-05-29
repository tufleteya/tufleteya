import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import firebase from 'firebase/compat/app';
import { combineLatest, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

type OperacionesTab = 'alertas' | 'comunicaciones' | 'incidencias' | 'chats';
type DestinatarioComunicacion = 'todos' | 'usuarios' | 'fleteros' | 'usuario' | 'fletero';

interface ActorAdmin {
  id: string;
  nombre?: string;
  apellido?: string;
  email?: string;
  perfil: 'Usuario' | 'Fletero';
}

interface AlertaOperacion {
  id: string;
  origen: 'usuario' | 'antifraude';
  tipo: string;
  estado?: string;
  fecha?: Date;
  usuarioId?: string;
  fleteroId?: string;
  pedidoId?: string;
  motivo?: string;
  detalle?: string;
  distanciaDestinoMetros?: number | null;
  umbralMetros?: number | null;
  actorNombre?: string;
}

interface IncidenciaOperacion {
  id: string;
  tipo: string;
  estado: 'abierta' | 'en_revision' | 'resuelta' | 'descartada';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  titulo: string;
  detalle: string;
  actorId?: string;
  actorPerfil?: 'Usuario' | 'Fletero' | 'Admin';
  actorNombre?: string;
  pedidoId?: string;
  fleteProcesoId?: string;
  respuestaAdmin?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ComunicacionAdmin {
  id: string;
  destinatario: DestinatarioComunicacion;
  destinatarioId?: string;
  titulo: string;
  mensaje: string;
  prioridad: 'info' | 'importante' | 'urgente';
  estado: 'activa' | 'cerrada';
  createdAt?: Date;
}

interface ChatResumenAdmin {
  id: string;
  path?: string;
  userId?: string;
  fleteroId?: string;
  userNombre?: string;
  fleteroNombre?: string;
  estado?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
}

@Component({
  selector: 'app-operaciones-component',
  templateUrl: './operaciones-component.component.html',
})
export class OperacionesComponentComponent implements OnInit, OnDestroy {
  tab: OperacionesTab = 'alertas';
  cargando = true;
  guardandoComunicacion = false;
  guardandoIncidencia = false;
  resolviendoIncidencia: Record<string, boolean> = {};
  busqueda = '';

  actores: ActorAdmin[] = [];
  alertas: AlertaOperacion[] = [];
  incidencias: IncidenciaOperacion[] = [];
  comunicaciones: ComunicacionAdmin[] = [];
  chats: ChatResumenAdmin[] = [];

  comunicacionForm = {
    destinatario: 'todos' as DestinatarioComunicacion,
    destinatarioId: '',
    titulo: '',
    mensaje: '',
    prioridad: 'info' as 'info' | 'importante' | 'urgente',
  };

  incidenciaForm = {
    tipo: 'reporte_manual',
    prioridad: 'media' as 'baja' | 'media' | 'alta' | 'critica',
    titulo: '',
    detalle: '',
    actorId: '',
    pedidoId: '',
  };

  respuestaIncidencia: Record<string, string> = {};

  private readonly subs = new Subscription();

  constructor(private firestore: AngularFirestore) {}

  get alertasPendientes(): number {
    return this.alertas.filter((item) => (item.estado || 'pendiente') === 'pendiente').length;
  }

  get incidenciasAbiertas(): number {
    return this.incidencias.filter((item) => ['abierta', 'en_revision'].includes(item.estado)).length;
  }

  get comunicacionesActivas(): number {
    return this.comunicaciones.filter((item) => item.estado === 'activa').length;
  }

  get chatsActivos(): number {
    return this.chats.filter((item) => item.estado !== 'cerrado').length;
  }

  get actoresFiltrados(): ActorAdmin[] {
    const target = this.comunicacionForm.destinatario;
    if (target === 'usuario') {
      return this.actores.filter((actor) => actor.perfil === 'Usuario');
    }
    if (target === 'fletero') {
      return this.actores.filter((actor) => actor.perfil === 'Fletero');
    }
    return this.actores;
  }

  ngOnInit(): void {
    this.cargarOperaciones();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  setTab(tab: OperacionesTab): void {
    this.tab = tab;
  }

  async emitirComunicacion(): Promise<void> {
    const titulo = this.comunicacionForm.titulo.trim();
    const mensaje = this.comunicacionForm.mensaje.trim();
    const destinatarioId = this.comunicacionForm.destinatarioId.trim();

    if (!titulo || !mensaje) {
      alert('Completá título y mensaje.');
      return;
    }

    if (['usuario', 'fletero'].includes(this.comunicacionForm.destinatario) && !destinatarioId) {
      alert('Seleccioná un destinatario específico.');
      return;
    }

    this.guardandoComunicacion = true;
    try {
      await this.firestore.collection('ComunicacionesAdmin').add({
        destinatario: this.comunicacionForm.destinatario,
        destinatarioId: destinatarioId || null,
        titulo,
        mensaje,
        prioridad: this.comunicacionForm.prioridad,
        estado: 'activa',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      this.comunicacionForm = {
        destinatario: 'todos',
        destinatarioId: '',
        titulo: '',
        mensaje: '',
        prioridad: 'info',
      };
    } catch (error) {
      console.error('Error emitiendo comunicación admin', error);
      alert('No se pudo emitir la comunicación.');
    } finally {
      this.guardandoComunicacion = false;
    }
  }

  async crearIncidenciaManual(): Promise<void> {
    const titulo = this.incidenciaForm.titulo.trim();
    const detalle = this.incidenciaForm.detalle.trim();

    if (!titulo || !detalle) {
      alert('Completá título y detalle de la incidencia.');
      return;
    }

    const actor = this.actores.find((item) => item.id === this.incidenciaForm.actorId);
    this.guardandoIncidencia = true;

    try {
      await this.firestore.collection('ReportesIncidencias').add({
        tipo: this.incidenciaForm.tipo,
        estado: 'abierta',
        prioridad: this.incidenciaForm.prioridad,
        titulo,
        detalle,
        actorId: actor?.id || null,
        actorPerfil: actor?.perfil || 'Admin',
        actorNombre: actor ? this.nombreActor(actor) : 'Admin',
        pedidoId: this.incidenciaForm.pedidoId.trim() || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      this.incidenciaForm = {
        tipo: 'reporte_manual',
        prioridad: 'media',
        titulo: '',
        detalle: '',
        actorId: '',
        pedidoId: '',
      };
    } catch (error) {
      console.error('Error creando incidencia', error);
      alert('No se pudo crear la incidencia.');
    } finally {
      this.guardandoIncidencia = false;
    }
  }

  async actualizarIncidencia(item: IncidenciaOperacion, estado: IncidenciaOperacion['estado']): Promise<void> {
    this.resolviendoIncidencia[item.id] = true;
    try {
      await this.firestore.collection('ReportesIncidencias').doc(item.id).set({
        estado,
        respuestaAdmin: this.respuestaIncidencia[item.id]?.trim() || item.respuestaAdmin || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Error actualizando incidencia', error);
      alert('No se pudo actualizar la incidencia.');
    } finally {
      this.resolviendoIncidencia[item.id] = false;
    }
  }

  async actualizarAlertaAntifraude(item: AlertaOperacion, estado: 'pendiente' | 'revisada' | 'descartada'): Promise<void> {
    if (item.origen !== 'antifraude') {
      return;
    }

    try {
      await this.firestore.collection('AlertasAntifraude').doc(item.id).set({
        estado,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Error actualizando alerta antifraude', error);
      alert('No se pudo actualizar la alerta.');
    }
  }

  nombreActor(actor?: ActorAdmin): string {
    if (!actor) {
      return '-';
    }
    return `${actor.nombre || ''} ${actor.apellido || ''}`.trim() || actor.email || actor.id;
  }

  fechaTexto(value?: Date): string {
    return value ? value.toLocaleString('es-AR') : '-';
  }

  private cargarOperaciones(): void {
    const usuarios$ = this.firestore.collection('Usuarios').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => ({
        id: doc.payload.doc.id,
        perfil: 'Usuario' as const,
        ...(doc.payload.doc.data() as any),
      })))
    );

    const fleteros$ = this.firestore.collection('Fleteros').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => ({
        id: doc.payload.doc.id,
        perfil: 'Fletero' as const,
        ...(doc.payload.doc.data() as any),
      })))
    );

    const alertasUsuarios$ = this.firestore.collection('AlertasAdminUsuarios').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => {
        const data = doc.payload.doc.data() as any;
        return {
          id: doc.payload.doc.id,
          origen: 'usuario' as const,
          tipo: 'penalizacion_usuario',
          estado: data.estado || 'pendiente',
          fecha: this.normalizeDate(data.fecha),
          usuarioId: data.usuarioId,
          pedidoId: data.pedidoId,
          motivo: data.motivo,
          detalle: data.detalleAdmin || data.zonaTexto,
          actorNombre: data.usuarioNombre,
        };
      }))
    );

    const alertasAntifraude$ = this.firestore.collection('AlertasAntifraude').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => {
        const data = doc.payload.doc.data() as any;
        return {
          id: doc.payload.doc.id,
          origen: 'antifraude' as const,
          tipo: data.tipo || 'antifraude',
          estado: data.estado || 'pendiente',
          fecha: this.normalizeDate(data.fecha),
          usuarioId: data.usuarioId,
          fleteroId: data.fleteroId,
          pedidoId: data.pedidoId,
          motivo: data.motivo,
          detalle: data.route ? `${data.route.desde || ''} → ${data.route.hasta || ''}` : '',
          distanciaDestinoMetros: data.distanciaDestinoMetros,
          umbralMetros: data.umbralMetros,
        };
      }))
    );

    const incidencias$ = this.firestore.collection('ReportesIncidencias').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => {
        const data = doc.payload.doc.data() as any;
        return {
          id: doc.payload.doc.id,
          tipo: data.tipo || 'reporte',
          estado: data.estado || 'abierta',
          prioridad: data.prioridad || 'media',
          titulo: data.titulo || 'Incidencia sin título',
          detalle: data.detalle || '',
          actorId: data.actorId,
          actorPerfil: data.actorPerfil,
          actorNombre: data.actorNombre,
          pedidoId: data.pedidoId,
          fleteProcesoId: data.fleteProcesoId,
          respuestaAdmin: data.respuestaAdmin,
          createdAt: this.normalizeDate(data.createdAt),
          updatedAt: this.normalizeDate(data.updatedAt),
        } as IncidenciaOperacion;
      }))
    );

    const comunicaciones$ = this.firestore.collection('ComunicacionesAdmin').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => {
        const data = doc.payload.doc.data() as any;
        return {
          id: doc.payload.doc.id,
          destinatario: data.destinatario || 'todos',
          destinatarioId: data.destinatarioId || '',
          titulo: data.titulo || '',
          mensaje: data.mensaje || '',
          prioridad: data.prioridad || 'info',
          estado: data.estado || 'activa',
          createdAt: this.normalizeDate(data.createdAt),
        } as ComunicacionAdmin;
      }))
    );

    const chats$ = this.firestore.collectionGroup('chats').snapshotChanges().pipe(
      map((snapshot) => snapshot.map((doc) => {
        const data = doc.payload.doc.data() as any;
        return {
          id: data.id || doc.payload.doc.id,
          path: doc.payload.doc.ref.path,
          userId: data.userId,
          fleteroId: data.fleteroId,
          userNombre: data.userNombre,
          fleteroNombre: data.fleteroNombre,
          estado: data.estado,
          lastMessage: data.lastMessage,
          lastMessageTime: this.normalizeDate(data.lastMessageTime),
        } as ChatResumenAdmin;
      }))
    );

    this.subs.add(combineLatest([
      usuarios$,
      fleteros$,
      alertasUsuarios$,
      alertasAntifraude$,
      incidencias$,
      comunicaciones$,
      chats$,
    ]).subscribe({
      next: ([usuarios, fleteros, alertasUsuarios, alertasAntifraude, incidencias, comunicaciones, chats]) => {
        this.actores = [...usuarios, ...fleteros].sort((a, b) => this.nombreActor(a).localeCompare(this.nombreActor(b)));
        this.alertas = [...alertasUsuarios, ...alertasAntifraude]
          .sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
        this.incidencias = incidencias.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        this.comunicaciones = comunicaciones.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        this.chats = chats.sort((a, b) => (b.lastMessageTime?.getTime() || 0) - (a.lastMessageTime?.getTime() || 0)).slice(0, 80);
        this.cargando = false;
      },
      error: (error) => {
        console.error('Error cargando centro operativo', error);
        this.cargando = false;
      },
    }));
  }

  private normalizeDate(value: any): Date | undefined {
    if (!value) {
      return undefined;
    }
    if (typeof value?.toDate === 'function') {
      return value.toDate();
    }
    if (typeof value?.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
