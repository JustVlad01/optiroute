import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

// Bootstrap types
declare var bootstrap: any;

// Define the Driver interface
interface Driver {
  id: number;
  name: string;
  custom_id: string;
  role: string;
  location: string;
  phone_number?: string;
}

@Component({
  selector: 'app-roster',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './roster.component.html',
  styleUrls: ['./roster.component.scss']
})
export class RosterComponent implements OnInit {
  drivers: Driver[] = [];
  loading = true;
  message = '';
  isError = false;
  selectedDriver: Driver | null = null;
  
  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDrivers();
  }

  async loadDrivers(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.supabaseService.getAllDrivers();
      if (data) {
        this.drivers = data as Driver[];
      } else {
        this.drivers = [];
        this.message = 'Failed to load drivers.';
        this.isError = true;
      }
    } catch (error) {
      console.error('Error loading drivers:', error);
      this.message = 'An unexpected error occurred while loading drivers.';
      this.isError = true;
      this.drivers = [];
    } finally {
      this.loading = false;
    }
  }

  navigateToRegister(): void {
    this.router.navigate(['/register']);
  }

  confirmDelete(driver: Driver): void {
    this.selectedDriver = driver;
    // Open the modal using Bootstrap's JavaScript API
    const modal = document.getElementById('deleteModal');
    if (modal) {
      // @ts-ignore: Using Bootstrap modal method
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    }
  }

  async deleteDriver(): Promise<void> {
    if (!this.selectedDriver) return;
    
    try {
      const success = await this.supabaseService.deleteDriver(this.selectedDriver.id);
      
      // Close the modal
      const modal = document.getElementById('deleteModal');
      if (modal) {
        // @ts-ignore: Using Bootstrap modal method
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal?.hide();
      }
      
      if (success) {
        this.message = `Driver ${this.selectedDriver.name} deleted successfully.`;
        this.isError = false;
        // Reload the drivers list
        this.loadDrivers();
      } else {
        this.message = 'Failed to delete driver.';
        this.isError = true;
      }
    } catch (error) {
      console.error('Error deleting driver:', error);
      this.message = 'An unexpected error occurred during deletion.';
      this.isError = true;
    } finally {
      this.selectedDriver = null;
    }
  }
} 