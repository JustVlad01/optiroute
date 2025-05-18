import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Store } from '../../models';

@Component({
  selector: 'app-store-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './store-library.component.html',
  styleUrls: ['./store-library.component.scss']
})
export class StoreLibraryComponent implements OnInit {
  searchCode: string = '';
  store: Store | null = null;
  loading: boolean = false;
  error: string | null = null;
  searchPerformed: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) { }

  ngOnInit(): void {
  }

  async searchStore(): Promise<void> {
    if (!this.searchCode.trim()) {
      this.error = 'Please enter a store code or dispatch code';
      return;
    }

    this.loading = true;
    this.error = null;
    this.searchPerformed = true;
    
    try {
      this.store = await this.supabaseService.getStoreByCode(this.searchCode.trim());
      if (!this.store) {
        this.error = 'No store found with this code';
      }
    } catch (err) {
      console.error('Error searching for store:', err);
      this.error = 'An error occurred while searching for the store';
    } finally {
      this.loading = false;
    }
  }

  clearSearch(): void {
    this.searchCode = '';
    this.store = null;
    this.error = null;
    this.searchPerformed = false;
  }
  
  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
} 