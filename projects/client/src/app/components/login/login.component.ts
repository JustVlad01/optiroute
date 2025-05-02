import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Driver } from '../../models';

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
  message: string = '';
  isError: boolean = false;
  isLoading: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async onSubmit() {
    this.message = '';
    this.isError = false;
    this.isLoading = true;

    if (!this.customId) {
        this.message = 'Custom ID is required.';
        this.isError = true;
        this.isLoading = false;
        return;
    }

    try {
      const driver = await this.supabaseService.loginWithCustomId(this.customId);

      if (driver) {
        // Navigate to dashboard (driver info is already saved in localStorage by the service)
        this.router.navigate(['/dashboard']);
      } else {
        this.message = 'Login failed: Invalid Custom ID.';
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
}
