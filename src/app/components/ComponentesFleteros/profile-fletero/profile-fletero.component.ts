import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MetricasFletero, Opiniones, UserF, VehiculoFletero } from 'src/app/folder/models/models';
import { AuthService } from 'src/app/folder/services/auth.service';
import { FirestoreService } from 'src/app/folder/services/firestore.service';
import { InteractionService } from 'src/app/folder/services/interaction.service';

@Component({
  selector: 'app-profile-fletero',
  templateUrl: './profile-fletero.component.html',
  styleUrls: ['./profile-fletero.component.scss'],
})
export class ProfileFleteroComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();

  login = false;
  DatosF: UserF;
  vehiculos: VehiculoFletero[] = [];
  cantidadViajes = 0;
  resenas: Array<Opiniones & { rating?: number; comment?: string; date?: any }> = [];
  metricas: MetricasFletero | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private db: FirestoreService,
    private interaction: InteractionService
  ) {}

  ngOnInit(): void {
    this.auth.stateUser<UserF>()
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res) {
          this.login = false;
          this.router.navigate(['/login']);
          return;
        }

        this.login = true;
        const id = res.uid;

        this.db.getDoc<UserF>('Fleteros', id)
          .pipe(takeUntil(this.destroy$))
          .subscribe((fletero) => {
            if (fletero) {
              this.DatosF = fletero;
            }
          });

        this.db.getDoc<MetricasFletero>('MetricasFleteros', id)
          .pipe(takeUntil(this.destroy$))
          .subscribe((metricas) => {
            this.metricas = metricas || null;
          });

        this.db.angularFirestore.collection('PedidosHechos').ref.where('fleteroId', '==', id).get().then((snapshot) => {
          this.cantidadViajes = snapshot.size;
        });

        this.db.angularFirestore
          .collectionGroup('reviews', ref => ref.where('fleteroId', '==', id))
          .valueChanges({ idField: 'id' })
          .pipe(takeUntil(this.destroy$))
          .subscribe((reviews: any[]) => {
            this.resenas = (reviews || []) as Array<Opiniones & { rating?: number; comment?: string; date?: any }>;
          });

        this.cargarVehiculos(id);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get promedioResenas(): number {
    if (!this.resenas.length) return 0;
    const ratings = this.resenas.map((resena: any) => Number(resena.rating || 0)).filter(Boolean);
    if (!ratings.length) return 0;
    const total = ratings.reduce((sum, rating) => sum + rating, 0);
    return Math.round((total / ratings.length) * 10) / 10;
  }

  get scoreConfiabilidad(): number {
    return Number(this.metricas?.scoreConfiabilidad ?? 0);
  }

  get tasaFinalizacion(): number {
    return Number(this.metricas?.tasaFinalizacion ?? 0);
  }

  get vehiculoPrincipal(): VehiculoFletero | null {
    return this.vehiculos.find((vehiculo) => vehiculo.principal) || this.vehiculos[0] || null;
  }

  private normalizarFecha(valor: any): Date | null {
    if (!valor) {
      return null;
    }

    if (valor instanceof Date) {
      return valor;
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

  formatearFecha(valor: any): string {
    const fecha = this.normalizarFecha(valor);
    if (!fecha) {
      return 'Sin fecha';
    }

    return fecha.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  get estadoAlta(): string {
    if (!this.DatosF) {
      return 'Sin datos';
    }

    if (this.DatosF.bloqueoManualAdmin) {
      return 'Bloqueo manual';
    }

    if (this.DatosF.bloqueadoPorVencimiento) {
      return 'Vencido';
    }

    if (this.DatosF.bloqueadoPorSancion) {
      return 'Bloqueado por sanción';
    }

    if (!this.DatosF.habilitado) {
      return 'Pendiente de revisión';
    }

    const estadoRegistro = (this.DatosF.estadoRegistro || 'Activo').toLowerCase();

    switch (estadoRegistro) {
      case 'auth':
        return 'Autenticado';
      case 'vehiculo':
        return 'Vehículo';
      case 'documentacion':
        return 'Documentación';
      case 'pendiente_revision':
        return 'Pendiente de revisión';
      case 'completo':
        return 'Completo';
      default:
        return this.DatosF.estadoRegistro || 'Activo';
    }
  }

  get estadoDocumentacion(): string {
    if (!this.DatosF) {
      return 'Sin datos';
    }

    if (this.DatosF.documentacionCompleta) {
      return 'Completa';
    }

    return 'Pendiente';
  }

  get estadoAntecedentes(): string {
    if (!this.DatosF) {
      return 'Sin datos';
    }

    if (this.DatosF.antecedentesPenales?.aprobado) {
      return 'Aprobados';
    }

    if (this.DatosF.antecedentesPenales?.url) {
      return 'En revisión';
    }

    return 'Pendientes';
  }

  handleFileInput(event: Event): void {
    this.auth.stateUser<UserF>().pipe(takeUntil(this.destroy$)).subscribe((res) => {
      if (!res) return;

      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      void this.uploadProfileImage(file, res.uid)
        .then((imageUrl) => this.db.updateDoc('Fleteros', res.uid, {
          image: imageUrl,
          photoURL: imageUrl,
        }).then(() => {
          this.DatosF.image = imageUrl;
          this.DatosF.photoURL = imageUrl;
        }))
        .catch((error) => {
          if (this.isStorageQuotaError(error)) {
            console.warn('No se pudo subir la imagen porque la cuota de Firebase Storage esta agotada.');
          } else {
            console.error('Error al actualizar la imagen:', error);
          }
          void this.interaction.presentToast(this.getProfileImageErrorMessage(error));
        });
    });
  }

  private isStorageQuotaError(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();

    return code.includes('quota-exceeded') || message.includes('quota');
  }

  private getProfileImageErrorMessage(error: any): string {
    if (this.isStorageQuotaError(error)) {
      return 'No se pudo subir la imagen: la cuota de Firebase Storage esta agotada.';
    }

    const code = String(error?.code || '').toLowerCase();
    if (code.includes('unauthorized') || code.includes('permission-denied')) {
      return 'No se pudo subir la imagen: no tenes permisos para esta accion.';
    }

    return 'No se pudo actualizar la imagen de perfil.';
  }

  private async uploadProfileImage(file: File, uid: string): Promise<string> {
    const resizedImage = await this.resizeImageFile(file, 800, 600);
    const storageRef = this.db.fireStorage.ref(`Fleteros/${uid}/perfil/profile.jpg`);
    const uploadTask = await storageRef.putString(resizedImage, 'data_url', {
      contentType: 'image/jpeg',
    });

    return uploadTask.ref.getDownloadURL();
  }

  private resizeImageFile(file: File, maxWidth: number, maxHeight: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        this.resizeImage(reader.result as string, maxWidth, maxHeight, resolve);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  resizeImage(imageData: string, maxWidth: number, maxHeight: number, callback: (resizedImage: string) => void): void {
    const img = new Image();
    img.src = imageData;
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else if (height > maxHeight) {
        width *= maxHeight / height;
        height = maxHeight;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const resizedImage = canvas.toDataURL('image/jpeg', 0.8);
      callback(resizedImage);
    };
  }

  openFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  trackByVehiculo(_: number, vehiculo: VehiculoFletero): string {
    return vehiculo.id || `${vehiculo.marca}-${vehiculo.patente}`;
  }

  private cargarVehiculos(id: string): void {
    this.db.angularFirestore.collection(`Fleteros/${id}/Vehiculos`)
      .valueChanges({ idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (vehiculos: VehiculoFletero[]) => {
        if (vehiculos && vehiculos.length > 0) {
          this.vehiculos = [...vehiculos].sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)));
          return;
        }

        const fletero = await firstValueFrom(
          this.db.getDoc<UserF>('Fleteros', id)
        ).catch(() => null);
        const principal = fletero?.datosVehiculos || null;

        if (principal) {
          this.vehiculos = [{
            ...principal,
            id,
            principal: true,
          }];
        } else {
          this.vehiculos = [];
        }
      });
  }
}
