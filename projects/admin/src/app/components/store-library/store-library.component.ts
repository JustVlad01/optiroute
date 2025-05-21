import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-store-library',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './store-library.component.html',
  styleUrl: './store-library.component.scss'
})
export class StoreLibraryComponent implements OnInit {
  // Store data
  stores: any[] = [];
  filteredStores: any[] = [];
  selectedStore: any = null;
  
  // Search
  searchTerm: string = '';
  suggestedStores: any[] = [];
  showSuggestions: boolean = false;
  
  // Images
  storeImages: any[] = [];
  selectedImage: any = null;
  imageFile: File | null = null;
  imagePreviewUrl: string = '';
  imageAnnotation: string = '';
  imageUploading: boolean = false;
  storefrontSaving: boolean = false;
  
  // Shop storefront image
  shopImageFile: File | null = null;
  shopImagePreviewUrl: string = '';
  shopImageAnnotation: string = '';
  shopImageUploading: boolean = false;
  
  // Additional Info
  additionalInfo: string = '';
  additionalInfoLoading: boolean = false;
  additionalInfoSaving: boolean = false;
  
  // UI state
  loading: boolean = false;
  imageTabActive: boolean = true;
  hasSearched: boolean = false;
  error: string = '';
  
  constructor(private supabaseService: SupabaseService) {}
  
  ngOnInit(): void {
    // Don't load stores initially
  }
  
  // Handle input changes for auto-suggest
  async onSearchInput(): Promise<void> {
    // Load stores if they haven't been loaded yet
    if (this.stores.length === 0 && this.searchTerm.trim().length > 0) {
      this.loading = true;
      try {
        const data = await this.supabaseService.getStoreInformation();
        if (data) {
          this.stores = data;
        }
      } catch (error) {
        console.error('Error loading stores:', error);
      } finally {
        this.loading = false;
      }
    }
    
    // Show suggestions when there's text in the search box
    if (this.searchTerm.trim().length > 0) {
      this.showSuggestions = true;
      const searchTermLower = this.searchTerm.toLowerCase();
      
      // Filter to find matching stores
      this.suggestedStores = this.stores.filter(store => {
        return (store.store_name?.toLowerCase().includes(searchTermLower) ||
                store.store_code?.toLowerCase().includes(searchTermLower) ||
                store.dispatch_code?.toLowerCase().includes(searchTermLower) ||
                store.address_line?.toLowerCase().includes(searchTermLower) ||
                store.eircode?.toLowerCase().includes(searchTermLower));
      }).slice(0, 6); // Limit to 6 suggestions
    } else {
      this.showSuggestions = false;
      this.suggestedStores = [];
    }
  }
  
  // Select a suggestion
  selectSuggestion(store: any): void {
    this.searchTerm = store.store_name || store.store_code || '';
    this.showSuggestions = false;
    this.suggestedStores = [];
    this.selectedStore = store;
    this.loadStoreImages();
    this.loadAdditionalInfo();
  }
  
  // Hide suggestions when clicking elsewhere
  hideSuggestions(): void {
    // Small delay to allow selecting a suggestion before hiding
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }
  
  // Modify searchStores method to include delivery day filtering
  async searchStores(): Promise<void> {
    // Existing search code
    this.loading = true;
    this.hasSearched = true;
    this.error = '';
    
    try {
      let stores = [];
      
      if (this.searchTerm.trim() === '') {
        stores = await this.supabaseService.getAllStores();
      } else {
        stores = await this.supabaseService.searchStores(this.searchTerm);
      }
      
      this.filteredStores = stores;
      
      if (this.filteredStores.length === 0) {
        this.error = 'No stores found matching your search criteria.';
      }
    } catch (error) {
      console.error('Error searching stores:', error);
      this.error = 'An error occurred while searching for stores.';
    } finally {
      this.loading = false;
    }
  }
  
  // Filter stores based on search term
  filterStores(): void {
    if (!this.searchTerm.trim()) {
      this.filteredStores = [];
      return;
    }
    
    const searchTermLower = this.searchTerm.toLowerCase();
    this.filteredStores = this.stores.filter(store => {
      // Search by store name, code, address, etc.
      return store.store_name?.toLowerCase().includes(searchTermLower) ||
             store.store_code?.toLowerCase().includes(searchTermLower) ||
             store.dispatch_code?.toLowerCase().includes(searchTermLower) ||
             store.address_line?.toLowerCase().includes(searchTermLower) ||
             store.eircode?.toLowerCase().includes(searchTermLower);
    });
  }
  
  // Clear search results
  clearSearch(): void {
    this.searchTerm = '';
    this.filteredStores = [];
    this.suggestedStores = [];
    this.showSuggestions = false;
    this.hasSearched = false;
  }
  
  // Select a store
  async selectStore(store: any): Promise<void> {
    this.selectedStore = store;
    this.loadStoreImages();
    this.loadAdditionalInfo();
  }
  
  // Load store images
  async loadStoreImages(): Promise<void> {
    if (!this.selectedStore?.store_id) return;
    
    try {
      // Get store images from Supabase
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_images')
        .select('*')
        .eq('store_id', this.selectedStore.store_id);
      
      if (error) {
        console.error('Error fetching store images:', error);
        return;
      }
      
      this.storeImages = data || [];
      this.selectedImage = null;
    } catch (error) {
      console.error('Exception during image fetch:', error);
    }
  }
  
  // Load additional info
  async loadAdditionalInfo(): Promise<void> {
    if (!this.selectedStore?.store_id) return;
    
    this.additionalInfoLoading = true;
    
    try {
      // Get additional info from Supabase
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_additional_info')
        .select('content')
        .eq('store_id', this.selectedStore.store_id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching additional info:', error);
        this.additionalInfo = '';
        return;
      }
      
      this.additionalInfo = data?.content || '';
    } catch (error) {
      console.error('Exception during additional info fetch:', error);
    } finally {
      this.additionalInfoLoading = false;
    }
  }
  
  // Select an image
  selectImage(image: any): void {
    this.selectedImage = image;
    this.imageAnnotation = image.instructions || '';
  }
  
  // Handle file input change
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    
    const file = input.files[0];
    this.imageFile = file;
    
    // Create a preview URL
    this.imagePreviewUrl = URL.createObjectURL(file);
  }
  
  // Clear selected file
  clearSelectedFile(): void {
    this.imageFile = null;
    this.imagePreviewUrl = '';
    this.imageAnnotation = '';
  }
  
  // Upload image to Supabase
  async uploadImage(): Promise<void> {
    if (!this.imageFile || !this.selectedStore?.store_id) return;
    
    this.imageUploading = true;
    
    try {
      // 1. Upload to storage bucket
      const fileName = `${Date.now()}_${this.imageFile.name}`;
      const filePath = `stores/${this.selectedStore.store_id}/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await this.supabaseService.getSupabase()
        .storage
        .from('store-images')
        .upload(filePath, this.imageFile);
      
      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        return;
      }
      
      // 2. Get public URL
      const { data: urlData } = await this.supabaseService.getSupabase()
        .storage
        .from('store-images')
        .getPublicUrl(filePath);
      
      // 3. Save to store_images table
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_images')
        .insert([{
          store_id: this.selectedStore.store_id,
          file_path: filePath,
          url: urlData.publicUrl,
          file_name: fileName,
          instructions: this.imageAnnotation,
          uploaded_at: new Date().toISOString()
        }])
        .select();
      
      if (error) {
        console.error('Error saving image data:', error);
        return;
      }
      
      // Reload images and clear form
      this.loadStoreImages();
      this.clearSelectedFile();
    } catch (error) {
      console.error('Exception during image upload:', error);
    } finally {
      this.imageUploading = false;
    }
  }
  
  // Update image annotation
  async updateImageAnnotation(): Promise<void> {
    if (!this.selectedImage?.id) return;
    
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_images')
        .update({ instructions: this.imageAnnotation })
        .eq('id', this.selectedImage.id)
        .select();
      
      if (error) {
        console.error('Error updating image annotation:', error);
        return;
      }
      
      // Update the selected image with the new data
      this.selectedImage = data[0];
      
      // Also update in the array
      const index = this.storeImages.findIndex(img => img.id === this.selectedImage.id);
      if (index !== -1) {
        this.storeImages[index] = this.selectedImage;
      }
    } catch (error) {
      console.error('Exception during annotation update:', error);
    }
  }
  
  // Set image as storefront
  async setAsStorefront(image: any): Promise<void> {
    if (!image?.id || !this.selectedStore?.store_id) return;
    
    this.storefrontSaving = true;
    
    try {
      // First, unset any existing storefront images for this store
      await this.supabaseService.getSupabase()
        .from('store_images')
        .update({ is_storefront: false })
        .eq('store_id', this.selectedStore.store_id)
        .eq('is_storefront', true);
      
      // Then set this image as storefront
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_images')
        .update({ is_storefront: true })
        .eq('id', image.id)
        .select();
      
      if (error) {
        console.error('Error setting storefront image:', error);
        return;
      }
      
      // Reload images to reflect the change
      await this.loadStoreImages();
      
      // Update the selected image if it's the one that was modified
      if (this.selectedImage?.id === image.id) {
        this.selectedImage = this.storeImages.find(img => img.id === image.id);
      }
      
    } catch (error) {
      console.error('Exception during storefront setting:', error);
    } finally {
      this.storefrontSaving = false;
    }
  }
  
  // Remove storefront status
  async removeStorefrontStatus(image: any): Promise<void> {
    if (!image?.id) return;
    
    this.storefrontSaving = true;
    
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_images')
        .update({ is_storefront: false })
        .eq('id', image.id)
        .select();
      
      if (error) {
        console.error('Error removing storefront status:', error);
        return;
      }
      
      // Reload images to reflect the change
      await this.loadStoreImages();
      
      // Update the selected image if it's the one that was modified
      if (this.selectedImage?.id === image.id) {
        this.selectedImage = this.storeImages.find(img => img.id === image.id);
      }
      
    } catch (error) {
      console.error('Exception during storefront removal:', error);
    } finally {
      this.storefrontSaving = false;
    }
  }
  
  // Delete image
  async deleteImage(image: any): Promise<void> {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
      // 1. Delete from storage
      const { error: storageError } = await this.supabaseService.getSupabase()
        .storage
        .from('store-images')
        .remove([image.file_path]);
      
      if (storageError) {
        console.error('Error deleting image from storage:', storageError);
      }
      
      // 2. Delete from database
      const { error: dbError } = await this.supabaseService.getSupabase()
        .from('store_images')
        .delete()
        .eq('id', image.id);
      
      if (dbError) {
        console.error('Error deleting image from database:', dbError);
        return;
      }
      
      // Reload images and clear selection
      this.loadStoreImages();
      if (this.selectedImage?.id === image.id) {
        this.selectedImage = null;
      }
    } catch (error) {
      console.error('Exception during image deletion:', error);
    }
  }
  
  // Save additional info
  async saveAdditionalInfo(): Promise<void> {
    if (!this.selectedStore?.store_id) return;
    
    this.additionalInfoSaving = true;
    
    try {
      // Check if store has an existing additional info record
      const { data: existingData, error: checkError } = await this.supabaseService.getSupabase()
        .from('store_additional_info')
        .select('id')
        .eq('store_id', this.selectedStore.store_id)
        .maybeSingle();
      
      let result;
      
      if (existingData?.id) {
        // Update existing record
        result = await this.supabaseService.getSupabase()
          .from('store_additional_info')
          .update({ 
            content: this.additionalInfo,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingData.id);
      } else {
        // Insert new record
        result = await this.supabaseService.getSupabase()
          .from('store_additional_info')
          .insert({
            store_id: this.selectedStore.store_id,
            content: this.additionalInfo,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
      
      if (result.error) {
        console.error('Error saving additional info:', result.error);
      }
    } catch (error) {
      console.error('Exception during additional info save:', error);
    } finally {
      this.additionalInfoSaving = false;
    }
  }
  
  // Switch tabs
  setActiveTab(isImageTab: boolean): void {
    this.imageTabActive = isImageTab;
  }
  
  // Navigation
  navigateTo(url: string): void {
    window.location.href = url;
  }
  
  // Handle shop file input change
  onShopFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    
    const file = input.files[0];
    this.shopImageFile = file;
    
    // Create a preview URL
    this.shopImagePreviewUrl = URL.createObjectURL(file);
  }
  
  // Clear selected shop file
  clearShopSelectedFile(): void {
    this.shopImageFile = null;
    this.shopImagePreviewUrl = '';
    this.shopImageAnnotation = '';
  }
  
  // Get current shop image if exists
  getShopImage(): any {
    return this.storeImages.find(img => img.is_shop_image === true);
  }
  
  // Upload shop image to Supabase
  async uploadShopImage(): Promise<void> {
    if (!this.shopImageFile || !this.selectedStore?.store_id) return;
    
    this.shopImageUploading = true;
    
    try {
      // 1. Upload to storage bucket
      const fileName = `shop_${Date.now()}_${this.shopImageFile.name}`;
      const filePath = `stores/${this.selectedStore.store_id}/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await this.supabaseService.getSupabase()
        .storage
        .from('store-images')
        .upload(filePath, this.shopImageFile);
      
      if (uploadError) {
        console.error('Error uploading shop image:', uploadError);
        return;
      }
      
      // 2. Get public URL
      const { data: urlData } = await this.supabaseService.getSupabase()
        .storage
        .from('store-images')
        .getPublicUrl(filePath);
      
      // 3. First, remove any existing shop image flag
      if (this.getShopImage()) {
        await this.supabaseService.getSupabase()
          .from('store_images')
          .update({ is_shop_image: false })
          .eq('store_id', this.selectedStore.store_id)
          .eq('is_shop_image', true);
      }
      
      // 4. Save to store_images table with shop image flag
      const { data, error } = await this.supabaseService.getSupabase()
        .from('store_images')
        .insert([{
          store_id: this.selectedStore.store_id,
          file_path: filePath,
          url: urlData.publicUrl,
          file_name: fileName,
          instructions: this.shopImageAnnotation,
          uploaded_at: new Date().toISOString(),
          is_shop_image: true,
          is_storefront: true // Also set as storefront for the driver view
        }])
        .select();
      
      if (error) {
        console.error('Error saving shop image data:', error);
        return;
      }
      
      // Reload images and clear form
      this.loadStoreImages();
      this.clearShopSelectedFile();
    } catch (error) {
      console.error('Exception during shop image upload:', error);
    } finally {
      this.shopImageUploading = false;
    }
  }
  
  // Add method to update store delivery day fields
  updateStoreField(field: string, value: string): void {
    if (!this.selectedStore) return;
    
    this.supabaseService.updateStore(this.selectedStore.store_id, { [field]: value })
      .then(() => {
        console.log(`Updated store ${field} to ${value}`);
        // Update the local selectedStore object
        this.selectedStore[field] = value;
      })
      .catch((error: any) => {
        console.error(`Error updating store ${field}:`, error);
      });
  }
}
