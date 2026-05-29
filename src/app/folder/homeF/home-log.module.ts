import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
// import { HomeLogComponent } from './home-log.component';
import { ComponentsModule } from 'src/app/components/components.module';
import { IonicModule } from '@ionic/angular';
import { HomePageRoutingModule } from '../home/home-routing.module';
import { ChatModule } from '../chat/chat.module';



@NgModule({
  declarations: [
    // HomeLogComponent,
  ],
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    HomePageRoutingModule,
    ChatModule,
  ],
  exports: [
    // HomeLogComponent,
  ]
})
export class HomeLogModule { }
