import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { filter, switchMap, take, takeUntil } from 'rxjs/operators';
import { Timestamp } from '@angular/fire/firestore';

import { ChatService } from './chat-services';
import { AuthService } from '../services/auth.service';
import { InteractionService } from '../services/interaction.service';
import { RoleResolverService } from '../services/role-resolver.service';
import { Perfil, SupportChat, SupportMessage, SupportRequesterType } from '../models/models';

@Component({
  selector: 'app-support-chat',
  templateUrl: './support-chat.component.html',
  styleUrls: ['./support-chat.component.scss'],
})
export class SupportChatComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  currentUserId = '';
  requesterType: SupportRequesterType = 'Usuario';
  supportChat?: SupportChat;
  mensajes$: Observable<SupportMessage[]> = of([]);

  nuevoMensaje = '';
  asunto = 'Consulta general';
  enviando = false;
  loading = true;

  readonly motivos = [
    'Problema con un viaje',
    'Pago o precio',
    'Cuenta o verificacion',
    'Fletero no responde',
    'Usuario no responde',
    'Reportar incidente',
    'Consulta general',
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
        switchMap((user) => {
          this.currentUserId = user.uid;
          return this.roleResolver.resolvePerfil(user.uid).pipe(take(1));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((perfil) => {
        this.requesterType = perfil === 'Fletero' ? 'Fletero' : 'Usuario';
        this.iniciarChat();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  enviarMensaje(): void {
    const text = this.nuevoMensaje.trim();
    if (!text || !this.supportChat?.id || this.enviando) {
      return;
    }

    if (this.supportChat.status === 'archivado' || this.supportChat.status === 'cerrado') {
      this.interaction.presentToast('Esta conversacion ya fue archivada. Abriremos una nueva si necesitas ayuda.');
      this.supportChat = undefined;
      this.iniciarChat(text);
      return;
    }

    this.enviando = true;
    this.chatService.sendSupportMessage(
      this.supportChat.id,
      this.currentUserId,
      this.requesterType === 'Fletero' ? 'fletero' : 'usuario',
      text
    )
      .then(() => {
        this.nuevoMensaje = '';
      })
      .catch((error) => {
        console.error('Error enviando mensaje a soporte', error);
        this.interaction.presentToast('No se pudo enviar el mensaje a soporte.');
      })
      .finally(() => {
        this.enviando = false;
      });
  }

  seleccionarMotivo(motivo: string): void {
    this.asunto = motivo;

    if (this.supportChat?.id) {
      this.chatService.updateSupportChatSubject(this.supportChat.id, motivo).catch((error) => {
        console.warn('No se pudo actualizar el motivo de soporte:', error);
      });
    }
  }

  getFecha(fecha: Date | Timestamp | any | null): Date | null {
    if (!fecha) return null;
    if (fecha instanceof Date) return fecha;
    if (typeof fecha.toDate === 'function') return fecha.toDate();
    return null;
  }

  trackByMensajeId(index: number, mensaje: SupportMessage): string | number {
    return mensaje.id || `${mensaje.senderId}-${index}`;
  }

  private iniciarChat(initialMessage?: string): void {
    this.loading = true;

    const profile$ = this.requesterType === 'Fletero'
      ? this.chatService.getFleteroById(this.currentUserId)
      : this.chatService.getUsuarioById(this.currentUserId);

    profile$.pipe(take(1)).subscribe((profile) => {
      const requesterName = `${profile?.nombre || ''} ${profile?.apellido || ''}`.trim()
        || profile?.email
        || this.requesterType;

      this.chatService.getOrCreateSupportChat(
        this.currentUserId,
        this.requesterType,
        requesterName,
        profile?.telefono || '',
        profile?.email || '',
        this.asunto
      )
        .then((chat) => {
          this.supportChat = chat;
          this.mensajes$ = this.chatService.getSupportMessages(chat.id);
          this.chatService.markSupportChatRead(chat.id, 'requester');

          if (initialMessage) {
            this.nuevoMensaje = initialMessage;
            this.enviarMensaje();
          }
        })
        .catch((error) => {
          console.error('Error iniciando chat de soporte', error);
          this.interaction.presentToast('No pudimos abrir soporte en este momento.');
        })
        .finally(() => {
          this.loading = false;
        });
    });
  }
}
