import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './chat.component';
import { SupportChatComponent } from './support-chat.component';

const routes: Routes = [
  { path: '', component: ChatComponent },
  { path: 'soporte/ayuda', component: SupportChatComponent },
  { path: ':chatId', component: ChatComponent }

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ChatRoutingModule {}
