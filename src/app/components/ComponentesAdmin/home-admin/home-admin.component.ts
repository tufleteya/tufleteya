import { Component } from '@angular/core';

@Component({
  selector: 'app-home-admin',
  templateUrl: './home-admin.component.html',
  styleUrls: ['./home-admin.component.scss'],
})
export class HomeAdminComponent {
  adminShortcuts = [
    {
      title: 'Dashboard',
      subtitle: 'Vista general del sistema',
      route: '/admin/dashboard',
      color: 'primary',
      icon: 'grid-outline',
    },
    {
      title: 'Usuarios',
      subtitle: 'Clientes y métricas',
      route: '/admin/usuarios',
      color: 'secondary',
      icon: 'people-outline',
    },
    {
      title: 'Fleteros',
      subtitle: 'Validación y sanciones',
      route: '/admin/fleteros',
      color: 'warning',
      icon: 'car-sport-outline',
    },
    {
      title: 'Pedidos',
      subtitle: 'Seguimiento operativo',
      route: '/admin/pedidos',
      color: 'success',
      icon: 'cube-outline',
    },
    {
      title: 'Reportes',
      subtitle: 'Cancelaciones y riesgo',
      route: '/admin/reportes',
      color: 'danger',
      icon: 'shield-checkmark-outline',
    },
  ];
}