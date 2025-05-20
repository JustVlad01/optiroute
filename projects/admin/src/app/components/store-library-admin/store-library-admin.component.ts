import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-store-library-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './store-library-admin.component.html',
  styleUrls: ['./store-library-admin.component.scss']
})
export class StoreLibraryAdminComponent implements OnInit {
  stores: any[] = [];
  selectedStore: any = null;
  searchTerm: string = '';
  filteredStores: any[] = [];
  isLoading: boolean = false;
  error: string = '';
  success: string = '';
  
  // For image upload
  selectedFiles: File[] = [];
  uploadProgress: number = 0;
  isUploading: boolean = false;
  
  // For image instructions
  currentImageInstructions: { [key: string]: string } = {};
  
  // For additional info
  additionalInfo: string = '';

  constructor(private supabaseService: SupabaseService) { }

  ngOnInit(): void {
    this.loadStores();
  }

  loadStores(): void {
    this.isLoading = true;
    console.log('Loading stores...');
    
    this.supabaseService.getStoreInformation()
      .then(data => {
        console.log('Stores data received:', data);
        console.log('Number of stores:', data ? data.length : 0);
        this.stores = data || [];
        this.filteredStores = [...this.stores];
        this.isLoading = false;
        
        if (this.stores.length === 0) {
          console.warn('No stores data found');
          this.error = 'No stores found in the database.';
        }
      })
      .catch(err => {
        console.error('Error loading stores:', err);
        this.error = 'Failed to load stores: ' + (err.message || 'Unknown error');
        this.isLoading = false;
      });
  }

  searchStores(): void {
    if (!this.searchTerm.trim()) {
      this.filteredStores = [...this.stores];
      return;
    }
    
    const term = this.searchTerm.toLowerCase();
    this.filteredStores = this.stores.filter(store => 
      (store.store_code && store.store_code.toLowerCase().includes(term)) ||
      (store.dispatch_code && store.dispatch_code.toLowerCase().includes(term)) ||
      (store.store_name && store.store_name.toLowerCase().includes(term)) ||
      (store.dispatch_store_name && store.dispatch_store_name.toLowerCase().includes(term))
    );
  }

  selectStore(store: any): void {
    this.selectedStore = store;
    this.loadStoreImages(store.store_id);
    this.loadStoreAdditionalInfo(store.store_id);
  }

  loadStoreImages(storeId: string): void {
    this.isLoading = true;
    this.supabaseService.getStoreImages(storeId)
      .then(data => {
        if (this.selectedStore) {
          this.selectedStore.images = data;
          this.currentImageInstructions = {};
          
          // Initialize instructions for each image
          if (data && data.length > 0) {
            data.forEach((img: any) => {
              this.currentImageInstructions[img.id] = img.instructions || '';
            });
          }
        }
        this.isLoading = false;
      })
      .catch(err => {
        this.error = 'Failed to load store images: ' + err.message;
        this.isLoading = false;
      });
  }

  loadStoreAdditionalInfo(storeId: string): void {
    this.supabaseService.getStoreAdditionalInfo(storeId)
      .then(data => {
        this.additionalInfo = data?.content || '';
      })
      .catch(err => {
        this.error = 'Failed to load additional info: ' + err.message;
      });
  }

  onFileSelected(event: any): void {
    this.selectedFiles = Array.from(event.target.files);
  }

  uploadImages(): void {
    if (!this.selectedStore || !this.selectedFiles.length) {
      this.error = 'Please select a store and at least one image';
      return;
    }
    
    this.isUploading = true;
    this.uploadProgress = 0;
    
    this.supabaseService.uploadStoreImages(this.selectedStore.store_id, this.selectedFiles)
      .then(result => {
        this.isUploading = false;
        this.uploadProgress = 100;
        this.success = 'Images uploaded successfully';
        this.selectedFiles = [];
        this.loadStoreImages(this.selectedStore.store_id);
      })
      .catch(err => {
        this.isUploading = false;
        this.error = 'Failed to upload images: ' + err.message;
      });
  }

  saveImageInstructions(imageId: string): void {
    if (!this.selectedStore) return;
    
    const instructions = this.currentImageInstructions[imageId];
    this.supabaseService.updateImageInstructions(imageId, instructions)
      .then(() => {
        this.success = 'Instructions saved successfully';
      })
      .catch(err => {
        this.error = 'Failed to save instructions: ' + err.message;
      });
  }

  saveAdditionalInfo(): void {
    if (!this.selectedStore) return;
    
    this.supabaseService.updateStoreAdditionalInfo(this.selectedStore.store_id, this.additionalInfo)
      .then(() => {
        this.success = 'Additional info saved successfully';
      })
      .catch(err => {
        this.error = 'Failed to save additional info: ' + err.message;
      });
  }

  deleteImage(imageId: string): void {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    this.supabaseService.deleteStoreImage(imageId)
      .then(() => {
        this.success = 'Image deleted successfully';
        if (this.selectedStore) {
          this.loadStoreImages(this.selectedStore.store_id);
        }
      })
      .catch(err => {
        this.error = 'Failed to delete image: ' + err.message;
      });
  }

  clearMessages(): void {
    this.error = '';
    this.success = '';
  }
} 