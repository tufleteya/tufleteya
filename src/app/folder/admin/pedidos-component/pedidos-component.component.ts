import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { combineLatest, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

type EstadoPedidoAdmin = 'Activo' | 'Confirmado' | 'Finalizado' | 'Cancelado';

interface PedidoAdmin {
  id: string;
  usuarioId?: string;
  pedidoId?: string;
  fleteId?: string;
  fleteroId?: string;
  nombre?: string;
  apellido?: string;
  uDesde?: string;
  uHasta?: string;
  tipoServicio?: string;
  precio?: number | string | null;
  precioAceptado?: number | string | null;
  respuesta?: { precio?: number | string | null };
  cantidadOfertas?: number;
  mejorOfertaPrecio?: number | null;
  cancelacion?: {
    motivo?: string;
    canceladoPor?: string;
    etapa?: string;
  };
  ubicacionActual?: { latitude: number; longitude: number };
  estado: EstadoPedidoAdmin;
  fechaOrden?: Date | null;
}

interface RespuestaAdmin {
  id: string;
  pedidoId: string;
  precio: number;
}

interface FleteProcesoAdmin {
  id: string;
  pedidoId: string;
  usuarioId?: string;
  precio: number;
}

@Component({
  selector: 'app-pedidos-component',
  templateUrl: './pedidos-component.component.html',
})
export class PedidosComponentComponent implements OnInit, OnDestroy {

  pedidos: PedidoAdmin[] = [];
  pedidosFiltrados: PedidoAdmin[] = [];
  filtroEstado: EstadoPedidoAdmin | 'Todos' = 'Todos';
  busqueda = '';
  cargando = true;
  private pedidosSub?: Subscription;

  constructor(private firestore: AngularFirestore) {}

  ngOnInit() {
    this.cargarPedidos();
  }

  ngOnDestroy() {
    this.pedidosSub?.unsubscribe();
  }

  cargarPedidos() {
    const pedidosActivos$ = this.firestore
      .collectionGroup('Pedidos')
      .snapshotChanges()
      .pipe(map(snapshot => snapshot.map(doc => this.mapPedido(doc, 'Activo'))));

    const pedidosConfirmados$ = this.firestore
      .collectionGroup('PedidosConfirmados')
      .snapshotChanges()
      .pipe(map(snapshot => snapshot.map(doc => this.mapPedido(doc, 'Confirmado'))));

    const pedidosFinalizados$ = this.firestore
      .collectionGroup('PedidosFinalizados')
      .snapshotChanges()
      .pipe(map(snapshot => snapshot.map(doc => this.mapPedido(doc, 'Finalizado'))));

    const pedidosCancelados$ = this.firestore
      .collectionGroup('PedidosCancelados')
      .snapshotChanges()
      .pipe(map(snapshot => snapshot.map(doc => this.mapPedido(doc, 'Cancelado'))));

    const respuestas$ = this.firestore
      .collectionGroup('Respuesta')
      .snapshotChanges()
      .pipe(map(snapshot => snapshot.map(doc => this.mapRespuesta(doc))));

    const fletesProceso$ = this.firestore
      .collectionGroup('FletesProceso')
      .snapshotChanges()
      .pipe(map(snapshot => snapshot.map(doc => this.mapFleteProceso(doc))));

    this.pedidosSub?.unsubscribe();
    this.pedidosSub = combineLatest([
      pedidosActivos$,
      pedidosConfirmados$,
      pedidosFinalizados$,
      pedidosCancelados$,
      respuestas$,
      fletesProceso$,
    ]).subscribe({
      next: ([activos, confirmados, finalizados, cancelados, respuestas, fletesProceso]) => {
      const respuestasPorPedido = this.groupRespuestasPorPedido(respuestas);
      const preciosFleteProceso = this.groupPreciosFleteProceso(fletesProceso);
      const activosConOfertas = activos.map((pedido) => {
        const ofertas = respuestasPorPedido.get(pedido.id) || [];
        const precios = ofertas
          .map((oferta) => Number(oferta.precio))
          .filter((precio) => Number.isFinite(precio) && precio > 0);

        return {
          ...pedido,
          cantidadOfertas: precios.length,
          mejorOfertaPrecio: precios.length ? Math.min(...precios) : null,
        };
      });

      const hidratarPrecio = (pedido: PedidoAdmin): PedidoAdmin => ({
        ...pedido,
        precioAceptado: this.obtenerPrecioPedido(pedido) || preciosFleteProceso.get(this.getPedidoKey(pedido)) || null,
      });

      this.pedidos = [
        ...activosConOfertas,
        ...confirmados.map(hidratarPrecio),
        ...finalizados.map(hidratarPrecio),
        ...cancelados.map(hidratarPrecio),
      ].sort((a, b) => (b.fechaOrden?.getTime() || 0) - (a.fechaOrden?.getTime() || 0));
      this.aplicarFiltros();

      this.cargando = false;
      },
      error: (error) => {
        console.error('Error cargando pedidos admin:', error);
        this.pedidos = [];
        this.cargando = false;
      },
    });
  }

  get totalActivos(): number {
    return this.pedidos.filter((pedido) => pedido.estado === 'Activo').length;
  }

  get totalConfirmados(): number {
    return this.pedidos.filter((pedido) => pedido.estado === 'Confirmado').length;
  }

  get totalFinalizados(): number {
    return this.pedidos.filter((pedido) => pedido.estado === 'Finalizado').length;
  }

  get totalCancelados(): number {
    return this.pedidos.filter((pedido) => pedido.estado === 'Cancelado').length;
  }

  aplicarFiltros() {
    const query = this.busqueda.trim().toLowerCase();
    this.pedidosFiltrados = this.pedidos.filter((pedido) => {
      const matchesEstado = this.filtroEstado === 'Todos' || pedido.estado === this.filtroEstado;
      const texto = [
        pedido.id,
        pedido.pedidoId,
        pedido.fleteroId,
        pedido.usuarioId,
        pedido.nombre,
        pedido.apellido,
        pedido.uDesde,
        pedido.uHasta,
        pedido.tipoServicio,
        pedido.cancelacion?.motivo,
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesEstado && (!query || texto.includes(query));
    });
  }

  getFechaTexto(pedido: PedidoAdmin): string {
    return pedido.fechaOrden ? pedido.fechaOrden.toLocaleString('es-AR') : '-';
  }

  getPrecioTexto(pedido: PedidoAdmin): string {
    if (pedido.estado === 'Activo') {
      if (!pedido.mejorOfertaPrecio) {
        return 'Sin ofertas';
      }

      const suffix = pedido.cantidadOfertas === 1 ? '1 oferta' : `${pedido.cantidadOfertas} ofertas`;
      return `${this.formatearMoneda(pedido.mejorOfertaPrecio)} (${suffix})`;
    }

    const precio = this.obtenerPrecioPedido(pedido);

    return precio > 0 ? this.formatearMoneda(precio) : 'Sin precio';
  }

  private mapPedido(doc: any, estado: EstadoPedidoAdmin): PedidoAdmin {
    const data = doc.payload.doc.data() as any;
    const ref = doc.payload.doc.ref;
    const usuarioId = data.usuarioId || data.uid || ref.parent?.parent?.id || '';
    const fechaOrden = this.normalizarFecha(
      data.fechaFinalizacion
      || data.fechaCancelacion
      || data.fechaConfirmacion
      || data.timestamp
      || data.fechaRegistro
    );

    return {
      ...data,
      id: doc.payload.doc.id,
      pedidoId: data.pedidoId || doc.payload.doc.id,
      usuarioId,
      estado,
      fechaOrden,
    };
  }

  private mapRespuesta(doc: any): RespuestaAdmin {
    const data = doc.payload.doc.data() as any;
    const ref = doc.payload.doc.ref;

    return {
      id: doc.payload.doc.id,
      pedidoId: ref.parent?.parent?.id || data.pedidoId || '',
      precio: Number(data.precio || 0),
    };
  }

  private mapFleteProceso(doc: any): FleteProcesoAdmin {
    const data = doc.payload.doc.data() as any;
    const precio = this.obtenerPrimerPrecioValido(
      data.precioAceptado,
      data.respuesta?.precio,
      data.precio
    );

    return {
      id: doc.payload.doc.id,
      pedidoId: data.pedidoId || doc.payload.doc.id,
      usuarioId: data.usuarioId || data.uid || '',
      precio,
    };
  }

  private groupRespuestasPorPedido(respuestas: RespuestaAdmin[]): Map<string, RespuestaAdmin[]> {
    return respuestas.reduce((mapa, respuesta) => {
      if (!respuesta.pedidoId) {
        return mapa;
      }

      const current = mapa.get(respuesta.pedidoId) || [];
      current.push(respuesta);
      mapa.set(respuesta.pedidoId, current);
      return mapa;
    }, new Map<string, RespuestaAdmin[]>());
  }

  private groupPreciosFleteProceso(fletesProceso: FleteProcesoAdmin[]): Map<string, number> {
    return fletesProceso.reduce((mapa, flete) => {
      if (!flete.pedidoId || flete.precio <= 0) {
        return mapa;
      }

      const keys = [
        flete.pedidoId,
        flete.usuarioId ? `${flete.usuarioId}/${flete.pedidoId}` : '',
      ].filter(Boolean);

      keys.forEach((key) => mapa.set(key, flete.precio));
      return mapa;
    }, new Map<string, number>());
  }

  private getPedidoKey(pedido: PedidoAdmin): string {
    return pedido.usuarioId ? `${pedido.usuarioId}/${pedido.pedidoId || pedido.id}` : (pedido.pedidoId || pedido.id);
  }

  private obtenerPrecioPedido(pedido: PedidoAdmin): number {
    return this.obtenerPrimerPrecioValido(
      pedido.precioAceptado,
      pedido.respuesta?.precio,
      pedido.precio
    );
  }

  private obtenerPrimerPrecioValido(...valores: Array<number | string | null | undefined>): number {
    for (const valor of valores) {
      if (valor === null || valor === undefined || valor === '') {
        continue;
      }

      const normalizado = typeof valor === 'string'
        ? Number(valor.replace(/[^\d,.-]/g, '').replace(',', '.'))
        : Number(valor);

      if (Number.isFinite(normalizado) && normalizado > 0) {
        return normalizado;
      }
    }

    return 0;
  }

  private formatearMoneda(valor: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(valor);
  }

  private normalizarFecha(valor: any): Date | null {
    if (!valor) {
      return null;
    }

    if (typeof valor?.toDate === 'function') {
      return valor.toDate();
    }

    if (typeof valor?.seconds === 'number') {
      return new Date(valor.seconds * 1000);
    }

    const parsed = new Date(valor);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
