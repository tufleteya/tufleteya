import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';
import { Timestamp } from '@angular/fire/firestore';

import { ChatService } from '../../chat/chat-services';
import { AuthService } from '../../services/auth.service';
import { InteractionService } from '../../services/interaction.service';
import { RoleResolverService } from '../../services/role-resolver.service';
import { RolPanel, SupportChat, SupportChatStatus, SupportMessage } from '../../models/models';

@Component({
  selector: 'app-soporte-component',
  templateUrl: './soporte-component.component.html',
  styleUrls: ['./soporte-component.component.scss'],
})
export class SoporteComponentComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  chats$: Observable<SupportChat[]> = of([]);
  mensajes$: Observable<SupportMessage[]> = of([]);
  selectedChat?: SupportChat;
  currentUserId = '';
  currentUserName = 'Soporte';
  rolPanel: RolPanel = 'Soporte';
  filtro: SupportChatStatus | 'todos' = 'en_espera';
  respuesta = '';
  enviando = false;

  readonly filtros: Array<{ value: SupportChatStatus | 'todos'; label: string }> = [
    { value: 'en_espera', label: 'Espera' },
    { value: 'atendido', label: 'Atendidos' },
    { value: 'archivado', label: 'Archivados' },
    { value: 'todos', label: 'Todos' },
  ];

  readonly respuestasRapidas = [
    'Gracias por avisarnos. Estamos revisando tu caso ahora.',
    'Para ayudarte mejor, enviame el numero de pedido o una captura del problema.',
    'Vamos a dejar este caso en seguimiento y te avisamos cuando tengamos una novedad.',
    'Ya tomamos la conversacion. Te pedimos unos minutos mientras verificamos la informacion.',
    'El caso queda archivado por falta de respuesta. Si necesitas seguir, podes escribir nuevamente.',
  ];

  constructor(
    private auth: AuthService,
    private chatService: ChatService,
    private interaction: InteractionService,
    private roleResolver: RoleResolverService,
  ) {}

  ngOnInit(): void {
    this.auth.stateUser()
      .pipe(
        filter((user): user is any => Boolean(user?.uid)),
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe((user) => {
        this.currentUserId = user.uid;
        this.currentUserName = user.displayName || user.email || 'Soporte';
        this.roleResolver.resolveRolPanel(user.uid).pipe(take(1)).subscribe((rol) => {
          this.rolPanel = rol || 'Soporte';
        });
      });

    this.cargarCola();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargarCola(): void {
    this.chats$ = this.chatService.getSupportQueue(this.filtro);
  }

  seleccionarChat(chat: SupportChat): void {
    this.selectedChat = chat;
    this.mensajes$ = this.chatService.getSupportMessages(chat.id);
    this.chatService.markSupportChatRead(chat.id, 'support');
  }

  tomarChat(chat = this.selectedChat): void {
    if (!chat) {
      return;
    }

    this.chatService.assignSupportChat(chat.id, this.currentUserId, this.currentUserName)
      .then(() => {
        this.selectedChat = {
          ...chat,
          assignedTo: this.currentUserId,
          assignedToName: this.currentUserName,
          status: 'atendido',
        };
      })
      .catch((error) => {
        console.error('Error tomando chat de soporte', error);
        this.interaction.presentToast('No se pudo tomar el chat.');
      });
  }

  enviarRespuesta(): void {
    const text = this.respuesta.trim();
    if (!text || !this.selectedChat || this.enviando) {
      return;
    }

    this.enviando = true;
    this.chatService.sendSupportMessage(
      this.selectedChat.id,
      this.currentUserId,
      this.rolPanel === 'Admin' ? 'admin' : 'soporte',
      text
    )
      .then(() => {
        this.respuesta = '';
        if (!this.selectedChat?.assignedTo) {
          this.tomarChat();
        }
      })
      .catch((error) => {
        console.error('Error respondiendo soporte', error);
        this.interaction.presentToast('No se pudo enviar la respuesta.');
      })
      .finally(() => {
        this.enviando = false;
      });
  }

  usarRespuestaRapida(texto: string): void {
    this.respuesta = texto;
  }

  archivarChat(): void {
    this.cambiarEstado('archivado');
  }

  cerrarChat(): void {
    this.cambiarEstado('cerrado');
  }

  reabrirChat(): void {
    this.cambiarEstado('en_espera');
  }

  getFecha(fecha: Date | Timestamp | any | null): Date | null {
    if (!fecha) return null;
    if (fecha instanceof Date) return fecha;
    if (typeof fecha.toDate === 'function') return fecha.toDate();
    return null;
  }

  trackByChatId(_: number, chat: SupportChat): string {
    return chat.id;
  }

  trackByMessageId(index: number, message: SupportMessage): string | number {
    return message.id || `${message.senderId}-${index}`;
  }

  private cambiarEstado(status: SupportChatStatus): void {
    if (!this.selectedChat) {
      return;
    }

    this.chatService.updateSupportChatStatus(this.selectedChat.id, status)
      .then(() => {
        this.selectedChat = this.selectedChat ? { ...this.selectedChat, status } : undefined;
        this.cargarCola();
      })
      .catch((error) => {
        console.error('Error actualizando estado de soporte', error);
        this.interaction.presentToast('No se pudo actualizar el estado.');
      });
  }
}
