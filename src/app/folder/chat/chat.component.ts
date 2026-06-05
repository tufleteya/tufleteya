import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';
import { ModalController } from '@ionic/angular';
import { combineLatest, Observable, Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';

import { ProfileModalComponent } from '../../components/profile-modal/profile-modal.component';
import { ChatService } from '../chat/chat-services';
import { Chat, Mensaje } from 'src/app/folder/models/models';
import { AuthService } from '../services/auth.service';
import { InteractionService } from '../services/interaction.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private loadedFleteroId = '';
  private loadedUsuarioId = '';
  private lastInitKey = '';
  private chatAutoCloseHandled = false;

  chatId?: string;
  currentUserId!: string;
  userId!: string;
  fleteroId!: string;
  fleteId!: string;

  pedido$!: Observable<any>;
  fleteroNombre = '';
  usuarioNombre = '';
  userNombre = '';
  otroParticipanteNombre = '';

  typing = false;
  fleteroEscribiendo = false;
  typingTimeout: any;

  rol: 'Usuario' | 'Fletero' = 'Usuario';

  pedido: any;
  fletero: any;
  fleteroData: any;
  usuarioData: any;

  mensajes$!: Observable<Mensaje[]>;
  nuevoMensaje: string = '';
  enviandoMensaje = false;

  loading: boolean = true;
  chatEstado: string = 'activo';
  mensajesRapidosFletero: string[] = [
    'Ya estoy en camino.',
    'Llego en 10 minutos.',
    'Estoy cargando el pedido ahora.',
    'Cuando llegue te aviso por acá.'
  ];
  mensajesRapidosUsuario: string[] = [
    'Perfecto, te espero en el punto de retiro.',
    'Avisame cuando estés cerca.',
    'Gracias, ya estoy listo con el cargamento.',
    'Cualquier cambio te escribo por acá.'
  ];

  constructor(
    private chatService: ChatService,
    private router: Router,
    private route: ActivatedRoute,
    private authS: AuthService,
    private interaction: InteractionService,
    private modalCtrl: ModalController,
  ) {
    const currentNavigation = this.router.getCurrentNavigation();

    if (currentNavigation?.extras.state) {
      this.pedido = currentNavigation.extras.state['pedido'];
      this.fletero = currentNavigation.extras.state['fletero'];

      this.fleteroId = this.fletero?.idFletero || this.fletero?.id;
      this.userId = this.pedido?.uid || '';
      this.fleteId = this.pedido?.id;
    }
  }

  ngOnInit() {
    this.authS.stateUser().pipe(takeUntil(this.destroy$)).subscribe((user) => {
      if (user) {
        this.currentUserId = user.uid;
        this.getUserName();
        if (this.chatId || (this.fleteroId && this.fleteId)) {
          this.inicializarChat();
        }
      }
    });

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([params, qParams]) => {
        this.chatId = params.get('chatId') || undefined;
        this.fleteroId = qParams.get('fleteroId') || this.fleteroId;
        this.fleteId = qParams.get('fleteId') || this.fleteId;
        this.userId = qParams.get('userId') || this.userId;

        if (this.chatId || (this.currentUserId && this.fleteroId && this.fleteId)) {
          this.inicializarChat();
        } else {
          console.error('Faltan datos para iniciar el chat');
        }
      });
  }

  ngOnDestroy(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    if (this.typing && this.chatId) {
      this.chatService.updateChatTyping(this.chatId, this.rol, false, this.currentUserId);
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  private getUserName() {
    if (!this.currentUserId) return;

    this.chatService.getUsuarioById(this.currentUserId).pipe(take(1)).subscribe((user) => {
      if (user) {
        this.userNombre = user.nombre || '';
      }
    });
  }

  private inicializarChat() {
    const initKey = [
      this.chatId || '',
      this.currentUserId || '',
      this.fleteroId || '',
      this.fleteId || '',
      this.userId || '',
    ].join('|');

    if (this.lastInitKey === initKey) {
      return;
    }

    this.lastInitKey = initKey;

    if (this.chatId) {
      this.mensajes$ = this.chatService.getMensajes(this.chatId, this.currentUserId);
      this.loading = false;
      this.escucharChatActual(this.chatId);

      if (this.fleteId) {
        this.pedido$ = this.chatService.getPedido(this.fleteId);
      }

      return;
    }

    if (!this.currentUserId || !this.fleteroId || !this.fleteId) {
      this.loading = false;
      return;
    }

    const userIdChat = this.userId || this.currentUserId;

    this.chatService
      .getOrCreateChat(
        userIdChat,
        this.fleteroId,
        this.fleteroNombre,
        this.fleteId,
        this.userNombre
      )
      .then((chat: Chat) => {
        this.chatId = chat.id!;
        this.fleteroNombre = chat.fleteroNombre;
        this.mensajes$ = this.chatService.getMensajes(this.chatId, this.currentUserId);
        this.userId = chat.userId;
        this.definirRol(chat);
        this.escucharChatActual(this.chatId);
        this.loading = false;
      })
      .catch((err) => {
        console.error('Error creando chat', err);
        this.loading = false;
      });
  }

  enviarMensaje() {
    if (!this.nuevoMensaje.trim() || !this.chatId || this.enviandoMensaje) return;

    if (this.chatEstado !== 'activo') {
      this.interaction.presentToast('No se pueden enviar mensajes en un chat finalizado.');
      return;
    }

    const mensaje = this.nuevoMensaje.trim();
    this.enviandoMensaje = true;

    this.chatService.enviarMensaje(
      this.chatId,
      this.currentUserId,
      this.rol === 'Fletero' ? 'fletero' : 'user',
      mensaje
    )
    .then(() => this.nuevoMensaje = '')
    .catch((err) => {
      console.error('Error enviando mensaje', err);
      this.interaction.presentToast('No se pudo enviar el mensaje.');
    })
    .finally(() => {
      this.enviandoMensaje = false;
    });
  }

  getFecha(fecha: Date | Timestamp | any | null): Date | null {
    if (!fecha) return null;
    if (fecha instanceof Date) return fecha;
    if (typeof fecha.toDate === 'function') return fecha.toDate();
    return null;
  }

  irAlChat(chatId: string) {
    this.router.navigate(['/chat', chatId]);
  }

  aceptarPedido() {
    if (!this.fleteId) return;
    this.chatService.actualizarEstadoFlete(this.fleteId, 'aceptado');
  }

  cancelarPedido() {
    if (!this.fleteId) return;
    this.chatService.actualizarEstadoFlete(this.fleteId, 'cancelado');
  }

  finalizarPedido() {
    if (!this.fleteId) return;
    this.chatService.actualizarEstadoFlete(this.fleteId, 'finalizado');
  }

  onTyping() {
    if (!this.chatId) return;

    if (!this.typing) {
      this.typing = true;
      this.chatService.updateChatTyping(this.chatId, this.rol, true, this.currentUserId);
    }

    clearTimeout(this.typingTimeout);

    this.typingTimeout = setTimeout(() => {
      this.typing = false;
      this.chatService.updateChatTyping(this.chatId!, this.rol, false, this.currentUserId);
    }, 1500);
  }

  usarMensajeRapido(mensaje: string) {
    if (this.chatEstado !== 'activo') {
      return;
    }

    this.nuevoMensaje = mensaje;
  }

  get mensajesRapidos(): string[] {
    return this.rol === 'Fletero' ? this.mensajesRapidosFletero : this.mensajesRapidosUsuario;
  }

  get estadoChatLabel(): string {
    if (this.chatEstado !== 'activo') {
      return 'Chat finalizado';
    }

    return this.fleteroEscribiendo
      ? `${this.otroParticipanteNombre || 'La otra persona'} está escribiendo...`
      : 'Chat activo';
  }

  get mensajePlaceholder(): string {
    return this.chatEstado === 'activo'
      ? 'Escribe un mensaje para coordinar el viaje'
      : 'El chat quedó solo en modo lectura';
  }

  async verPerfilParticipante() {
    const profileType = this.rol === 'Fletero' ? 'Usuario' : 'Fletero';
    const profileData = profileType === 'Usuario' ? this.usuarioData : this.fleteroData;

    if (!profileData) {
      return;
    }

    (document.activeElement as HTMLElement | null)?.blur?.();

    const modal = await this.modalCtrl.create({
      component: ProfileModalComponent,
      componentProps: {
        profileData,
        profileType,
      },
      cssClass: 'tfy-profile-modal',
    });
    await modal.present();
  }

  trackByMensajeId(index: number, mensaje: Mensaje): string | number {
    return mensaje.id || `${mensaje.senderId}-${mensaje.timestamp || index}`;
  }

  trackByTexto(_: number, texto: string): string {
    return texto;
  }

  get profileButtonLabel(): string {
    return this.rol === 'Fletero' ? 'Ver cliente' : 'Ver fletero';
  }

  get canOpenParticipantProfile(): boolean {
    return this.rol === 'Fletero' ? !!this.usuarioData : !!this.fleteroData;
  }

  private escucharChatActual(chatId: string) {
    this.chatService.getChat(chatId, this.currentUserId).pipe(takeUntil(this.destroy$)).subscribe((chat) => {
      if (!chat) return;

      this.chatEstado = chat.estado || 'activo';
      this.fleteroId = chat.fleteroId;
      this.userId = chat.userId;
      this.fleteId = chat.fleteId || (chat as any).pedidoId || this.fleteId;
      this.definirRol(chat);

      if (this.chatEstado !== 'activo') {
        this.nuevoMensaje = '';
        if (this.typing && this.chatId) {
          this.chatService.updateChatTyping(this.chatId, this.rol, false, this.currentUserId);
        }
        this.typing = false;
        this.cerrarChatAutomaticamente();
      }

      this.fleteroEscribiendo = this.rol === 'Fletero'
        ? !!chat.typing?.usuario
        : !!chat.typing?.fletero;

      this.cargarFletero(chat.fleteroId);
      this.cargarUsuario(chat.userId);
    });
  }

  private cerrarChatAutomaticamente(): void {
    if (this.chatAutoCloseHandled) {
      return;
    }

    this.chatAutoCloseHandled = true;
    this.interaction.presentToast('El viaje termino y el chat se cerro automaticamente.');

    window.setTimeout(() => {
      const target = this.rol === 'Fletero'
        ? ['/fletes/fletesDis']
        : ['/fletes/precios'];

      this.router.navigate(target, {
        queryParams: this.rol === 'Usuario' ? { segmento: 'enProceso' } : undefined,
        replaceUrl: true,
      });
    }, 1200);
  }

  private definirRol(chat: Chat) {
    if (!this.currentUserId) return;

    this.rol = this.currentUserId === chat.fleteroId ? 'Fletero' : 'Usuario';
    this.otroParticipanteNombre = this.rol === 'Fletero'
      ? (this.usuarioNombre || chat.userNombre || 'Cliente')
      : (this.fleteroNombre || chat.fleteroNombre || 'Fletero');
  }

  private cargarFletero(fleteroId: string): void {
    if (!fleteroId || this.loadedFleteroId === fleteroId) {
      return;
    }

    this.loadedFleteroId = fleteroId;
    this.chatService.getFleteroById(fleteroId).pipe(take(1)).subscribe((fletero) => {
      if (fletero) {
        this.fleteroNombre = `${fletero.nombre || ''} ${fletero.apellido || ''}`.trim();
        this.fleteroData = fletero;
        if (this.rol !== 'Fletero') {
          this.otroParticipanteNombre = this.fleteroNombre || 'Fletero';
        }
      }
    });
  }

  private cargarUsuario(userId: string): void {
    if (!userId || this.loadedUsuarioId === userId) {
      return;
    }

    this.loadedUsuarioId = userId;
    this.chatService.getUsuarioById(userId).pipe(take(1)).subscribe((usuario) => {
      if (usuario) {
        this.usuarioData = usuario;
        this.usuarioNombre = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim();
        if (this.rol === 'Fletero') {
          this.otroParticipanteNombre = this.usuarioNombre || 'Cliente';
        }
      }
    });
  }
}
