import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription } from 'rxjs';
import { shareReplay, take, takeUntil } from 'rxjs/operators';

import { ChatService } from 'src/app/folder/chat/chat-services';
import { Chat, Opiniones, UserU } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';

@Component({
  selector: 'app-home-user',
  templateUrl: './home-user.component.html',
  styleUrls: ['./home-user.component.scss'],
})
export class HomeUserComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private chatListSub: Subscription | null = null;
  private readonly fleterosCargados = new Set<string>();

  mostrarModalChat = false;
  chats$!: Observable<Chat[]>;
  userId!: string;
  fleteros: Map<string, any> = new Map();

  op: Opiniones = {
    id: '',
    nombre: '',
    apellido: '',
    mensaje: '',
    perfil: 'Usuario'
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private db: FirestoreService,
    private interaction: InteractionService,
    private authS: AuthService,
    private chatService: ChatService
  ) {}

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['openChat'] === 'true') {
        this.abrirSoporteChat();
      }
    });
  }

  ngOnDestroy(): void {
    this.cancelarSuscripcionChats();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* =========================
     SOPORTE CHAT
     ========================= */
  abrirSoporteChat() {
    if (this.mostrarModalChat) {
      return;
    }

    this.mostrarModalChat = true;

    this.authS.stateUser<UserU>().pipe(take(1)).subscribe((user) => {
      if (!user) return;

      this.userId = user.uid;
      this.chats$ = this.chatService.getChatsByUser(this.userId).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.cancelarSuscripcionChats();
      this.chatListSub = this.chats$
        .pipe(takeUntil(this.destroy$))
        .subscribe((chats) => this.cargarFleteros(chats));
    });
  }

  cerrarModalChat() {
    this.mostrarModalChat = false;
    this.cancelarSuscripcionChats();
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

  getFleteroFullName(fleteroId: string): string | null {
    const fletero = this.fleteros.get(fleteroId);
    return fletero ? `${fletero.nombre} ${fletero.apellido}` : null;
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

  /* =========================
     NAVEGACIÓN
     ========================= */
  pedirF() {
    this.router.navigate(['/fletes']);
  }

  verRespuestas() {
    this.router.navigate(['/fletes/precios']);
  }

  enviarOpinion() {
    this.authS.stateUser<UserU>().pipe(take(1)).subscribe((res) => {
      if (res) {
        const path = 'Usuarios';
        this.db.getDoc<UserU>(path, res.uid).pipe(take(1)).subscribe((res2) => {
          this.interaction.presentLoading;
          const data = this.op;
          data.id = res.uid;
          data.nombre = res2.nombre;
          data.apellido = res2.apellido;

          const enlace = 'Opiniones';

          this.db.createDoc<Opiniones>(data, enlace, data.id).then(() => {
            this.interaction.presentToast('Enviado con exito');
            this.interaction.closeLoading;
            this.router.navigate(['/home']);
            this.op = {
              id: data.id,
              nombre: '',
              apellido: '',
              perfil: 'Usuario',
              mensaje: '',
            };
          });
        });
      }
    });
  }

  private cancelarSuscripcionChats(): void {
    if (this.chatListSub) {
      this.chatListSub.unsubscribe();
      this.chatListSub = null;
    }
  }

  private cargarFleteros(chats: Chat[]): void {
    chats.forEach((chat) => {
      if (!chat.fleteroId || this.fleterosCargados.has(chat.fleteroId)) {
        return;
      }

      this.fleterosCargados.add(chat.fleteroId);
      this.chatService.getFleteroById(chat.fleteroId).pipe(take(1)).subscribe((fletero) => {
        if (fletero) {
          this.fleteros.set(chat.fleteroId, fletero);
        }
      });
    });
  }
}
