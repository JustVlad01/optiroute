import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
  ],
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.scss']
})
export class RegistrationComponent {
  driverName: string = '';
  customId: string = '';
  role: string = 'driver'; // Default to 'driver'
  location: string = 'Cork'; // Default to 'Cork'
  phoneNumber: string = '';
  message: string = '';
  isError: boolean = false;

  constructor(private supabaseService: SupabaseService) {}

  async onSubmit() {
    this.message = '';
    this.isError = false;

    if (!this.driverName || !this.customId) {
        this.message = 'Driver Name and Custom ID are required.';
        this.isError = true;
        return;
    }

    try {
      const result = await this.supabaseService.addDriver(
          this.driverName,
          this.customId,
          this.role,
          this.location,
          this.phoneNumber || undefined
      );

      if (result) {
        this.message = `Driver ${this.driverName} (ID: ${this.customId}) added successfully!`;
        this.driverName = '';
        this.customId = '';
        this.role = 'driver'; // Reset to default
        this.location = 'Cork'; // Reset to default
        this.phoneNumber = '';
      } else {
        this.message = 'Failed to add driver. Check console for errors.';
        this.isError = true;
      }
    } catch (error) {
        this.message = 'An unexpected error occurred. Check console.';
        this.isError = true;
        console.error('Registration onSubmit error:', error);
    }
  }
}
