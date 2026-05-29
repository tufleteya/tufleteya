import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  totalUsuarios = 0;
  totalFleteros = 0;
  pedidosActivos = 0;
  pedidosConfirmados = 0;
  chatsActivos = 0;
  usuarios = 0;
  fleteros = 0;
  fleterosVerificados = 0;
  fleterosNoVerificados = 0;
  cargando = true;

  private subs: Subscription[] = [];

  constructor(private firestore: AngularFirestore) {}

  get totalFleterosGrafico(): number {
    return this.fleterosVerificados + this.fleterosNoVerificados;
  }

  get totalPedidosGrafico(): number {
    return this.pedidosActivos + this.pedidosConfirmados;
  }

  get fleterosVerificadosPorcentaje(): number {
    return this.calcularPorcentaje(this.fleterosVerificados, this.totalFleterosGrafico);
  }

  get fleterosNoVerificadosPorcentaje(): number {
    return this.calcularPorcentaje(this.fleterosNoVerificados, this.totalFleterosGrafico);
  }

  get pedidosActivosPorcentaje(): number {
    return this.calcularPorcentaje(this.pedidosActivos, this.totalPedidosGrafico);
  }

  get pedidosConfirmadosPorcentaje(): number {
    return this.calcularPorcentaje(this.pedidosConfirmados, this.totalPedidosGrafico);
  }

  ngOnInit() {
    this.cargarDashboard();
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  cargarDashboard() {
    this.cargando = true;

    this.subs.push(
      this.firestore.collection('Usuarios').valueChanges()
        .subscribe({
          next: (res) => {
          this.totalUsuarios = res.length;
          this.usuarios = res.length;
          },
          error: (error) => this.handleLoadError('usuarios', error),
        })
    );

    this.subs.push(
      this.firestore.collection('Fleteros').valueChanges()
        .subscribe({
          next: (res: any[]) => {
          this.totalFleteros = res.length;
          this.fleteros = res.length;
          this.fleterosVerificados = res.filter((f) => f.verificado === true).length;
          this.fleterosNoVerificados = res.filter((f) => f.verificado !== true).length;
          },
          error: (error) => this.handleLoadError('fleteros', error),
        })
    );

    this.subs.push(
      this.firestore.collectionGroup('Pedidos')
        .valueChanges()
        .subscribe({
          next: (res) => this.pedidosActivos = res.length,
          error: (error) => this.handleLoadError('pedidos activos', error),
        })
    );

    this.subs.push(
      this.firestore.collectionGroup('PedidosConfirmados')
        .valueChanges()
        .subscribe({
          next: (res) => this.pedidosConfirmados = res.length,
          error: (error) => this.handleLoadError('pedidos confirmados', error),
        })
    );

    this.subs.push(
      this.firestore.collection('chats').valueChanges()
        .subscribe({
          next: (res) => {
          this.chatsActivos = res.length;
          this.cargando = false;
          },
          error: (error) => this.handleLoadError('chats', error),
        })
    );
  }

  private handleLoadError(context: string, error: unknown): void {
    console.error(`Error cargando ${context}:`, error);
    this.cargando = false;
  }

  private calcularPorcentaje(valor: number, total: number): number {
    if (!total) {
      return 0;
    }

    return Math.round((valor / total) * 100);
  }
}
