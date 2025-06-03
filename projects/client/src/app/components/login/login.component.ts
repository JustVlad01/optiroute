import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Driver } from '../../services/models';
import { PwaService } from '../../services/pwa.service';

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
export class LoginComponent implements OnInit {
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
    private router: Router,
    private pwaService: PwaService
  ) {}

  ngOnInit(): void {
    // Additional initialization logic if needed
  }

  // Helper method to check if passwords match
  passwordsMatch(): boolean {
    return this.password === this.confirmPassword;
  }

  // Helper method to check if password setup form is valid
  isPasswordSetupFormValid(): boolean {
    // Check if password meets minimum requirements
    const passwordValid = !!(this.password && this.password.length >= 6);
    
    // Check if confirm password is entered and matches
    const confirmPasswordValid = !!(this.confirmPassword && this.passwordsMatch());
    
    const isValid = passwordValid && confirmPasswordValid;
    
    // Debug logging
    console.log('Password validation:', {
      password: this.password,
      passwordLength: this.password?.length || 0,
      passwordValid,
      confirmPassword: this.confirmPassword,
      confirmPasswordValid,
      passwordsMatch: this.passwordsMatch(),
      isValid
    });
    
    return isValid;
  }

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

      // Attempt login with password (trim to avoid whitespace issues)
      const trimmedPassword = this.password.trim();
      console.log('Attempting login for driver:', this.customId);
      
      const driver = await this.supabaseService.loginWithCustomIdAndPassword(this.customId, trimmedPassword);

      if (driver) {
        console.log('Login successful for driver:', driver.name);
        // Navigate to dashboard
        this.router.navigate(['/dashboard']);
      } else {
        console.log('Login failed for driver:', this.customId);
        this.message = 'Invalid Driver ID or password. Please check your credentials and try again.';
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
      // Trim the password to avoid whitespace issues
      const trimmedPassword = this.password.trim();
      console.log('Setting password for driver:', this.customId);
      
      const driver = await this.supabaseService.setDriverPassword(this.customId, trimmedPassword);

      if (driver) {
        this.message = 'Password set successfully! You can now log in with your credentials.';
        this.isError = false;
        
        // Reset the form to login state after a short delay
        setTimeout(() => {
          this.resetForm();
          this.message = 'Password created successfully! Please log in with your Driver ID and new password.';
          this.isError = false;
        }, 2000);
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

  onAroundNoonClick(): void {
    console.log('Login: Around Noon clicked!');
    this.pwaService.handleAroundNoonClick();
  }
}
