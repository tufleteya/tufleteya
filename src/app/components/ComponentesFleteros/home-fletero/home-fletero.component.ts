import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Observable, Subject, Subscription } from 'rxjs';
import { shareReplay, take, takeUntil } from 'rxjs/operators';

import { ChatService } from 'src/app/folder/chat/chat-services';
import { Chat, DatosFlete, FleteEnProceso, Opiniones, UserF } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';

@Component({
  selector: 'app-home-fletero',
  templateUrl: './home-fletero.component.html',
  styleUrls: ['./home-fletero.component.scss'],
})
export class HomeFleteroComponent implements OnInit, OnDestroy {
  mostrarModalChat = false;
  chats$!: Observable<Chat[]>;
  fleteroId!: string;
  usuarios: Map<string, any> = new Map();

  mostrarModalFletes = false;
  activeTab: 'disponibles' | 'enProceso' | 'finalizados' = 'disponibles';

  fletes: DatosFlete[] = [];
  fletesEnProceso: FleteEnProceso[] = [];
  fletesFinalizados: FleteEnProceso[] = [];

  loadingFletes = false;
  private destroy$ = new Subject<void>();
  private fletesTabSub: Subscription | null = null;
  private chatListSub: Subscription | null = null;
  private readonly usuariosCargados = new Set<string>();

  op: Opiniones = {
    id: '',
    nombre: '',
    apellido: '',
    perfil: 'Fletero',
    mensaje: '',
  };

  verificado: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private db: FirestoreService,
    private authS: AuthService,
    private interaction: InteractionService,
    private chatService: ChatService,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['openChat'] === 'true') {
        this.abrirSoporteChat();
      }
    });

    this.authS.stateUser<UserF>()
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        if (user) {
          this.fleteroId = user.uid;
          this.cargarFletes('disponibles');
        }
      });
  }

  ngOnDestroy() {
    this.chatListSub?.unsubscribe();
    this.cancelarCargaFletes();
    this.destroy$.next();
    this.destroy$.complete();
  }

  cambiarTab(tab: 'disponibles' | 'enProceso' | 'finalizados') {
    this.activeTab = tab;
    this.cargarFletes(tab);
  }

  cargarFletes(tipo: 'disponibles' | 'enProceso' | 'finalizados') {
    if (!this.fleteroId) {
      return;
    }

    this.cancelarCargaFletes();
    this.loadingFletes = true;
    this.limpiarColeccionActiva(tipo);

    if (tipo === 'disponibles') {
      this.fletesTabSub = this.db.obtenerPedidosDisponibles().subscribe({
        next: (fletes) => {
          this.fletes = fletes.filter((flete) => !flete.visible?.[this.fleteroId]);
          this.loadingFletes = false;
        },
        error: (err) => {
          console.error('Error cargando fletes disponibles:', err);
          this.interaction.presentToast('No pudimos cargar los fletes disponibles.');
          this.fletes = [];
          this.loadingFletes = false;
        }
      });
    } else if (tipo === 'enProceso') {
      this.fletesTabSub = this.db.obtenerFletesProceso(this.fleteroId).subscribe({
        next: (fletes) => {
          this.fletesEnProceso = fletes.filter((f) =>
            f.estado === 'Confirmado' || f.estado === 'En Viaje'
          );
          this.loadingFletes = false;
        },
        error: (err) => {
          console.error('Error cargando fletes en proceso:', err);
          this.loadingFletes = false;
        }
      });
    } else if (tipo === 'finalizados') {
      this.fletesTabSub = this.db.obtenerFletesProceso(this.fleteroId).subscribe({
        next: (fletes) => {
          this.fletesFinalizados = fletes.filter((f) => f.estado === 'Finalizado');
          this.loadingFletes = false;
        },
        error: (err) => {
          console.error('Error cargando fletes finalizados:', err);
          this.loadingFletes = false;
        }
      });
    }
  }

  async abrirViajeTracking(flete: FleteEnProceso) {
    if (!flete.startCoordinates || !flete.endCoordinatesP) {
      this.interaction.presentToast('Este viaje no tiene ruta disponible');
      return;
    }

    const { VerRutaComponent } = await import('src/app/folder/mapbox/ver-ruta/ver-ruta.component');

    const modal = await this.modalController.create({
      component: VerRutaComponent,
      componentProps: {
        datos: {
          startCoordinates: flete.startCoordinates,
          endCoordinates: flete.endCoordinatesP,
          paradas: flete.paradas || [],
          routeDistanceKm: flete.routeDistanceKm,
          routeDurationMinutes: flete.routeDurationMinutes,
        },
        modo: 'tracking',
        fleteEnProceso: flete,
      },
    });

    modal.onDidDismiss().then((result) => {
      if (result.data?.viajeCompletado) {
        this.interaction.presentToast('Viaje finalizado y archivado');
        this.cargarFletes('enProceso');
        this.cargarFletes('finalizados');
        return;
      }

      if (result.data?.viajeCanceladoAntesDeIniciar || result.data?.viajeCancelado) {
        this.interaction.presentToast('Viaje cancelado');
        this.cargarFletes('enProceso');
      }
    });

    await modal.present();
  }

  async abrirChatViaje(flete: FleteEnProceso) {
    try {
      const chat = await this.db.getOrCreateChat(
        flete.usuarioId,
        flete.fleteroId,
        flete.pedidoId,
        {
          userNombre: this.buildFullName(flete.nombre, flete.apellido),
          pedidoResumen: {
            desde: flete.uDesde,
            hasta: flete.uHasta,
            fecha: flete.fecha,
            hora: flete.hora,
            minutos: flete.minutos,
            cargamento: flete.cargamento,
          }
        }
      );

      this.router.navigate(['/chat', chat.id], {
        queryParams: {
          fleteroId: flete.fleteroId,
          fleteId: flete.pedidoId,
          userId: flete.usuarioId,
        }
      });
    } catch (error) {
      console.error('Error al abrir chat del viaje:', error);
      this.interaction.presentToast('No se pudo abrir el chat');
    }
  }

  getRecordatorioInicio(flete: FleteEnProceso): string {
    const fechaInicio = this.construirFechaViaje(flete);

    if (!fechaInicio) return 'Coordiná la salida por el chat del viaje.';
    if (flete.estado === 'En Viaje') return 'Viaje en curso con seguimiento en tiempo real.';

    const diferenciaMs = fechaInicio.getTime() - Date.now();
    if (diferenciaMs <= 0) return 'La hora pactada ya llegó. Abrí el mapa para iniciar.';

    const totalMinutos = Math.ceil(diferenciaMs / 60000);
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;

    if (totalMinutos <= 15) return `Faltan ${totalMinutos} min para iniciar el viaje.`;
    if (horas > 0) return `Faltan ${horas}h ${minutos}m para el inicio.`;
    return `Faltan ${minutos} min para el inicio.`;
  }

  getRecordatorioClase(flete: FleteEnProceso): string {
    const fechaInicio = this.construirFechaViaje(flete);

    if (flete.estado === 'En Viaje') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (!fechaInicio) return 'bg-slate-50 text-slate-700 border-slate-200';

    const diferenciaMs = fechaInicio.getTime() - Date.now();
    if (diferenciaMs <= 0) return 'bg-red-50 text-red-700 border-red-200';
    if (diferenciaMs <= 15 * 60 * 1000) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  abrirSoporteChat() {
    if (this.mostrarModalChat) {
      return;
    }

    this.mostrarModalChat = true;
    this.chatListSub?.unsubscribe();

    this.authS.stateUser<UserF>().pipe(take(1)).subscribe((fletero) => {
      if (!fletero) {
        console.warn('No hay fletero autenticado');
        return;
      }

      this.fleteroId = fletero.uid;
      this.chats$ = this.chatService.getChatsByFletero(this.fleteroId).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.chatListSub = this.chats$.subscribe((chats) => {
        chats.forEach((chat) => {
          if (chat.userId && !this.usuariosCargados.has(chat.userId)) {
            this.usuariosCargados.add(chat.userId);
            this.chatService.getUsuarioById(chat.userId).pipe(take(1)).subscribe((user) => {
              if (user) {
                this.usuarios.set(chat.userId, user);
              }
            });
          }
        });
      });
    });
  }

  cerrarModalChat() {
    this.mostrarModalChat = false;
    this.chatListSub?.unsubscribe();
    this.chatListSub = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        openChat: null,
        openChatAt: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  abrirChat(chat: Chat) {
    this.cerrarModalChat();
    this.router.navigate(['/chat', chat.id], {
      queryParams: {
        fleteroId: chat.fleteroId,
        fleteId: chat.fleteId || chat.pedidoId,
        userId: chat.userId,
      }
    });
  }

  getUsuarioFullName(userId: string): string | null {
    const user = this.usuarios.get(userId);
    if (!user) {
      return null;
    }

    return this.buildFullName(user.nombre, user.apellido);
  }

  getChatDisplayName(chat: Chat): string {
    return this.getUsuarioFullName(chat.userId)
      || this.parseStoredFullName(chat.userNombre)
      || 'Cliente';
  }

  getPedidoRuta(chat: Chat): string {
    const desde = chat.pedidoResumen?.desde || 'Origen';
    const hasta = chat.pedidoResumen?.hasta || 'Destino';
    return `${desde} -> ${hasta}`;
  }

  getPedidoMeta(chat: Chat): string {
    const cargamento = chat.pedidoResumen?.cargamento || 'Sin detalle';
    const fecha = chat.pedidoResumen?.fecha;
    const hora = chat.pedidoResumen?.hora;
    const minutos = chat.pedidoResumen?.minutos;

    const fechaTexto = fecha ? new Date(fecha).toLocaleDateString('es-AR') : 'Fecha pendiente';
    const horaTexto = hora !== undefined && hora !== null
      ? `${hora}:${String(minutos ?? 0).padStart(2, '0')}`
      : 'Hora a coordinar';

    return `${cargamento} | ${fechaTexto} ${horaTexto}`;
  }

  getChatBadge(chat: Chat): string {
    return chat.estado === 'activo' ? 'Activo' : 'Cerrado';
  }

  trackByChatId(_: number, chat: Chat): string {
    return chat.id;
  }

  trackByFleteId(_: number, flete: DatosFlete | FleteEnProceso): string {
    return flete.id;
  }

  pedirF() {
    this.router.navigate(['/paso1']);
  }

  ChatV() {
    this.router.navigate(['/chat']);
  }

  VerFletes() {
    this.authS.stateUser<UserF>().pipe(take(1)).subscribe((res) => {
      if (res) {
        const path = 'Fleteros';
        this.db.getDoc<UserF>(path, res.uid).pipe(take(1)).subscribe((res2) => {
          if (res2.verificado === false) {
            alert('Tu cuenta no está verificada. Por favor, completa la verificación.');
          } else {
            this.router.navigate(['/fletes/fletesDis']);
          }
        });
      }
    });
  }

  irAlDashboardFletero(): void {
    this.router.navigateByUrl('/fletes/iniciarApp');
  }

  irAViajesDisponibles(): void {
    this.router.navigate(['/fletes/fletesDis']);
  }

  cerrarModalFletes() {
    this.mostrarModalFletes = false;
  }

  opcionNoHabilitada(): void {
    alert('Esta opción aún no está habilitada');
  }

  enviarOpinion() {
    this.authS.stateUser<UserF>().pipe(take(1)).subscribe((res) => {
      if (res) {
        const path = 'Fleteros';
        this.db.getDoc<UserF>(path, res.uid).pipe(take(1)).subscribe((res2) => {
          const data = this.op;
          data.id = res.uid;
          data.nombre = res2.nombre;
          data.apellido = res2.apellido;

          const enlace = 'Opiniones';

          this.db.createDoc<Opiniones>(data, enlace, data.id).then(() => {
            this.interaction.presentToast('Enviado con exito');
            this.interaction.closeLoading();

            this.op = {
              id: '',
              nombre: '',
              apellido: '',
              perfil: 'Fletero',
              mensaje: '',
            };
          });
        });
      }
    });
  }

  private limpiarColeccionActiva(tipo: 'disponibles' | 'enProceso' | 'finalizados'): void {
    if (tipo === 'disponibles') {
      this.fletes = [];
      return;
    }

    if (tipo === 'enProceso') {
      this.fletesEnProceso = [];
      return;
    }

    this.fletesFinalizados = [];
  }

  private cancelarCargaFletes(): void {
    if (this.fletesTabSub) {
      this.fletesTabSub.unsubscribe();
      this.fletesTabSub = null;
    }
  }

  private buildFullName(nombre?: string | null, apellido?: string | null): string | null {
    const partes = [nombre, apellido]
      .map((valor) => (typeof valor === 'string' ? valor.trim() : ''))
      .filter((valor) => valor && valor.toLowerCase() !== 'undefined' && valor.toLowerCase() !== 'null');

    return partes.length ? partes.join(' ') : null;
  }

  private parseStoredFullName(fullName?: string | null): string | null {
    if (!fullName || typeof fullName !== 'string') {
      return null;
    }

    const normalized = fullName
      .split(' ')
      .map((part) => part.trim())
      .filter((part) => part && part.toLowerCase() !== 'undefined' && part.toLowerCase() !== 'null');

    return normalized.length ? normalized.join(' ') : null;
  }

  private construirFechaViaje(flete: FleteEnProceso): Date | null {
    if (!flete?.fecha) return null;

    const baseFecha = new Date(flete.fecha as any);
    if (Number.isNaN(baseFecha.getTime())) return null;

    baseFecha.setHours(Number(flete.hora || 0), Number(flete.minutos || 0), 0, 0);
    return baseFecha;
  }
}
