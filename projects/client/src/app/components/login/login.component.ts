import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Driver } from '../../services/models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  customId: string = '';
  password: string = '';
  confirmPassword: string = '';
  message: string = '';
  isError: boolean = false;
  isLoading: boolean = false;
  showPasswordSetup: boolean = false;
  currentDriver: any = null;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async onSubmit() {
    this.message = '';
    this.isError = false;
    this.isLoading = true;

    if (!this.customId) {
        this.message = 'Driver ID is required.';
        this.isError = true;
        this.isLoading = false;
        return;
    }

    try {
      // First check if driver exists and has password set
      const passwordStatus = await this.supabaseService.checkDriverPasswordStatus(this.customId);

      if (!passwordStatus.exists) {
        this.message = 'Driver ID not found. Please check your Driver ID.';
        this.isError = true;
        this.isLoading = false;
        return;
      }

      if (!passwordStatus.hasPassword) {
        // Driver exists but no password set - show password setup
        this.currentDriver = passwordStatus.driver;
        this.showPasswordSetup = true;
        this.message = `Welcome ${this.currentDriver.name}! Please create a password for your account.`;
        this.isError = false;
        this.isLoading = false;
        return;
      }

      // Driver has password - check if password was provided
      if (!this.password) {
        this.message = 'Password is required.';
        this.isError = true;
        this.isLoading = false;
        return;
      }

      // Attempt login with password
      const driver = await this.supabaseService.loginWithCustomIdAndPassword(this.customId, this.password);

      if (driver) {
        // Navigate to dashboard
        this.router.navigate(['/dashboard']);
      } else {
        this.message = 'Invalid Driver ID or password.';
        this.isError = true;
      }
    } catch (error) {
        this.message = 'An unexpected error occurred during login. Check console.';
        this.isError = true;
        console.error('Login onSubmit error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async onPasswordSetup() {
    this.message = '';
    this.isError = false;
    this.isLoading = true;

    if (!this.password) {
      this.message = 'Password is required.';
      this.isError = true;
      this.isLoading = false;
      return;
    }

    if (this.password.length < 6) {
      this.message = 'Password must be at least 6 characters long.';
      this.isError = true;
      this.isLoading = false;
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.message = 'Passwords do not match.';
      this.isError = true;
      this.isLoading = false;
      return;
    }

    try {
      const driver = await this.supabaseService.setDriverPassword(this.customId, this.password);

      if (driver) {
        this.message = 'Password set successfully! Redirecting to dashboard...';
        this.isError = false;
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1500);
      } else {
        this.message = 'Failed to set password. Please try again.';
        this.isError = true;
      }
    } catch (error) {
      this.message = 'An unexpected error occurred. Please try again.';
      this.isError = true;
      console.error('Password setup error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  resetForm() {
    this.showPasswordSetup = false;
    this.currentDriver = null;
    this.password = '';
    this.confirmPassword = '';
    this.message = '';
    this.isError = false;
  }
}
