import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
// import { ChatComponent } from './chat.component';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from './chat.component';
import { ChatRoutingModule } from './chat-routing.module';
import { ComponentsModule } from 'src/app/components/components.module';



@NgModule({
  declarations: [
    ChatComponent,
  ],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ChatRoutingModule,
    ComponentsModule
  ],
  exports: [
    ChatComponent,
  ]
})
export class ChatModule { }
