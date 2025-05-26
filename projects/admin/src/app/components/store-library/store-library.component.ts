import { Component, OnInit, NgZone } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-store-library',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DatePipe],
  templateUrl: './store-library.component.html',
  styleUrl: './store-library.component.scss'
})
export class StoreLibraryComponent implements OnInit {
  // Search and store data
  searchQuery: string = '';
  loading: boolean = false;
  filteredStores: any[] = [];
  showSuggestions: boolean = false;
  filteredSuggestions: any[] = [];
  searchPerformed: boolean = false;
  allStores: any[] = [];

  // Selected store
  selectedStore: any = null;
  editableStore: any = null;
  editMode: boolean = false;
  savingChanges: boolean = false;

  // Access codes toggle
  showAccessCodes: boolean = false;

  // Status message
  statusMessage: {show: boolean, type: string, text: string} = {
    show: false, 
    type: '', 
    text: ''
  };
  
  // Delivery day status
  savingDeliveryDay: string | null = null;
  dayUpdateStatus: {show: boolean, type: string, text: string} = {
    show: false,
    type: '',
    text: ''
  };

  // Tab management
  activeTab: 'details' | 'additional-info' | 'images' = 'details';

  // Additional info
  additionalInfoEditing: boolean = false;
  additionalInfoText: string = '';
  savingAdditionalInfo: boolean = false;

  // Image uploads
  storefrontPreviewSrc: string | null = null;
  storefrontAnnotation: string = '';
  storefrontFile: File | null = null;
  uploadingStorefront: boolean = false;

  regularPreviewSrc: string | null = null;
  regularAnnotation: string = '';
  regularFile: File | null = null;
  uploadingRegular: boolean = false;

  storeImages: any[] = [];

  // Loading overlay
  showLoadingOverlay: boolean = false;
  loadingMessage: string = 'Loading...';
  
  // Compact mode
  compactMode: boolean = true;

  constructor(
    private supabaseService: SupabaseService,
    private ngZone: NgZone
  ) { }
  
  ngOnInit(): void {
    this.loadAllStores();
    // Try to load compact mode preference from localStorage
    const savedCompactMode = localStorage.getItem('storeLibraryCompactMode');
    if (savedCompactMode !== null) {
      this.compactMode = savedCompactMode === 'true';
    }
  }

  // Toggle compact mode
  toggleCompactMode(): void {
    this.compactMode = !this.compactMode;
    // Save preference to localStorage
    localStorage.setItem('storeLibraryCompactMode', this.compactMode.toString());
  }

  // --- Store Data Management ---
  async loadAllStores() {
      this.loading = true;
      try {
        const data = await this.supabaseService.getStoreInformation();
        if (data) {
        this.allStores = data.map(store => this.standardizeStoreData(store));
        }
      } catch (error) {
        console.error('Error loading stores:', error);
      this.showStatusMessage('error', 'Failed to load stores. Please try again later.');
      } finally {
        this.loading = false;
      }
    }
    
  // Standardize store data structure
  standardizeStoreData(store: any): any {
    // Handle the different structure from database
    return {
      ...store,
      // Normalize address field from address_line if not present
      address: store.address || store.address_line
    };
  }

  // --- Search Functionality ---
  onSearchInputChange() {
    // Show suggestions if there's search input
    this.showSuggestions = !!this.searchQuery && this.searchQuery.length > 1;
    
    if (this.showSuggestions) {
      this.filterSuggestions();
    }
  }

  filterSuggestions() {
    const query = this.searchQuery.toLowerCase();
    this.filteredSuggestions = this.allStores.filter(store => {
      return (
        (store.store_name && store.store_name.toLowerCase().includes(query)) ||
        (store.store_code && store.store_code.toLowerCase().includes(query)) ||
        (store.dispatch_code && store.dispatch_code.toLowerCase().includes(query)) ||
        (store.address && store.address.toLowerCase().includes(query)) ||
        (store.city && store.city.toLowerCase().includes(query))
      );
    }).slice(0, 7); // Limit suggestions
  }

  selectSuggestion(suggestion: any) {
    this.searchQuery = suggestion.store_name || suggestion.store_code || '';
      this.showSuggestions = false;
    this.searchStores();
  }
  
  searchStores() {
    this.loading = true;
    this.searchPerformed = true;
    
    const query = this.searchQuery.toLowerCase();
    if (!query) {
      this.filteredStores = [];
      this.loading = false;
      return;
    }
    
    this.filteredStores = this.allStores.filter(store => {
      return (
        (store.store_name && store.store_name.toLowerCase().includes(query)) ||
        (store.store_code && store.store_code.toLowerCase().includes(query)) ||
        (store.dispatch_code && store.dispatch_code.toLowerCase().includes(query)) ||
        (store.address && store.address.toLowerCase().includes(query)) ||
        (store.city && store.city.toLowerCase().includes(query)) ||
        (store.county && store.county.toLowerCase().includes(query)) ||
        (store.eircode && store.eircode.toLowerCase().includes(query))
      );
    });
    
    this.loading = false;
    this.showSuggestions = false;
  }

  clearSearch() {
    this.searchQuery = '';
    this.filteredStores = [];
    this.showSuggestions = false;
    this.searchPerformed = false;
  }

  // --- Store Selection and Editing ---
  async selectStore(store: any) {
    this.showLoadingOverlay = true;
    this.loadingMessage = 'Loading store details...';
    
    try {
      // Get complete store data including related data
      const storeData = await this.supabaseService.getStoreById(store.id);
      
      if (!storeData) {
        throw new Error('Store data not available');
      }
      
      this.selectedStore = this.standardizeStoreData(storeData);
      this.editableStore = null;
      this.editMode = false;
      
      // Reset tabs
      this.activeTab = 'details';
      
      // Load store images
      await this.loadStoreImages();
      
      // Load additional info
      await this.loadAdditionalInfo();
      
      // Load route details
      await this.loadRouteDetails();
    } catch (error) {
      console.error('Error loading store details:', error);
      this.showStatusMessage('error', 'Failed to load store details. Please try again later.');
    } finally {
      this.showLoadingOverlay = false;
    }
  }

  // Update delivery day checkbox value
  updateDeliveryDay(dayField: string, event: any): void {
    if (!this.editableStore) return;
    
    // Set the field value to 'yes' if checked, 'no' if unchecked
    this.editableStore[dayField] = event.target.checked ? 'yes' : 'no';
  }

  // Toggle and immediately save a delivery day setting
  async toggleAndSaveDeliveryDay(dayField: string): Promise<void> {
    if (!this.selectedStore || this.savingDeliveryDay) return;
    
    try {
      // Set the saving state for visual feedback
      this.savingDeliveryDay = dayField;
      
      // Toggle the current value
      const currentValue = this.selectedStore[dayField] === 'yes' ? 'no' : 'yes';
      
      // Optimistically update the UI
      this.selectedStore[dayField] = currentValue;
      
      // Create the changes object with just this field
      const changes: any = {
        id: this.selectedStore.id,
        [dayField]: currentValue
      };
      
      // Save to Supabase
      const result = await this.supabaseService.updateStoreInformation([changes]);
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Update the filtered/all stores arrays
      this.updateStoreInArrays(this.selectedStore.id, { [dayField]: currentValue });
      
      // Show a success indicator briefly
      this.showDayUpdateStatus('success', `Updated delivery schedule`);
    } catch (error) {
      console.error(`Error toggling delivery day ${dayField}:`, error);
      
      // Revert the UI change on failure
      this.selectedStore[dayField] = this.selectedStore[dayField] === 'yes' ? 'no' : 'yes';
      
      this.showDayUpdateStatus('error', `Failed to update delivery day. Please try again.`);
    } finally {
      // Clear the saving state
      setTimeout(() => {
        this.savingDeliveryDay = null;
      }, 300);
    }
  }
  
  // Update store in filteredStores and allStores arrays
  private updateStoreInArrays(storeId: string, changes: any): void {
    // Update in filteredStores
    const filteredIndex = this.filteredStores.findIndex(s => s.id === storeId);
    if (filteredIndex !== -1) {
      this.filteredStores[filteredIndex] = { 
        ...this.filteredStores[filteredIndex], 
        ...changes 
      };
    }
    
    // Update in allStores
    const allIndex = this.allStores.findIndex(s => s.id === storeId);
    if (allIndex !== -1) {
      this.allStores[allIndex] = { 
        ...this.allStores[allIndex], 
        ...changes 
      };
    }
  }
  
  // Show day-specific update status
  private showDayUpdateStatus(type: 'success' | 'error', text: string): void {
    this.dayUpdateStatus = {
      show: true,
      type,
      text
    };
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.dayUpdateStatus.show = false;
    }, 3000);
  }

  toggleEditMode() {
    if (!this.editMode) {
      // Create a deep copy of the selected store
      this.editableStore = JSON.parse(JSON.stringify(this.selectedStore));
      
      // Initialize delivery day fields if they don't exist
      const deliveryDays = ['deliver_monday', 'deliver_tuesday', 'deliver_wednesday', 
                            'deliver_thursday', 'deliver_friday', 'deliver_saturday'];
      
      deliveryDays.forEach(day => {
        if (!this.editableStore[day]) {
          this.editableStore[day] = 'no';
        }
      });
      
      this.editMode = true;
    } else {
      this.saveChanges();
    }
  }

  cancelEdit() {
    this.editMode = false;
    this.editableStore = null;
  }

  async saveChanges() {
    if (!this.editableStore || !this.selectedStore) return;
    
    this.savingChanges = true;
    
    try {
      // Compare fields to see if any have changed
      const changes: any = {};
      let hasChanges = false;
      
      // Check all fields in editableStore against selectedStore
      for (const key in this.editableStore) {
        // Only include fields that have changed
        if (this.editableStore[key] !== this.selectedStore[key]) {
          changes[key] = this.editableStore[key];
          hasChanges = true;
        }
      }
      
      if (!hasChanges) {
        this.showStatusMessage('info', 'No changes were made.');
        this.savingChanges = false;
        this.editMode = false;
        return;
      }
      
      // Add the id to the changes
      changes.id = this.selectedStore.id;
      
      // Update the store in Supabase
      const result = await this.supabaseService.updateStoreInformation([changes]);
      
      // Check if result contains an error property
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Update local data
      this.selectedStore = { ...this.selectedStore, ...this.editableStore };
      
      // Update the store in the filteredStores array
      const storeIndex = this.filteredStores.findIndex(s => s.id === this.selectedStore.id);
      if (storeIndex !== -1) {
        this.filteredStores[storeIndex] = { ...this.filteredStores[storeIndex], ...this.editableStore };
      }
      
      // Update the store in the allStores array
      const allStoreIndex = this.allStores.findIndex(s => s.id === this.selectedStore.id);
      if (allStoreIndex !== -1) {
        this.allStores[allStoreIndex] = { ...this.allStores[allStoreIndex], ...this.editableStore };
      }
      
      this.showStatusMessage('success', 'Changes saved successfully!');
      this.editMode = false;
    } catch (error) {
      console.error('Error saving changes:', error);
      this.showStatusMessage('error', 'Failed to save changes. Please try again.');
    } finally {
      this.savingChanges = false;
    }
  }

  // Helper to edit a specific field
  editField(fieldName: string) {
    if (this.editMode) return; // Already in edit mode
    
    // Create a deep copy of the selected store
    this.editableStore = JSON.parse(JSON.stringify(this.selectedStore));
    this.editMode = true;
    
    // Scroll to the field after the view updates
    setTimeout(() => {
      const element = document.querySelector(`[ng-reflect-model='${this.editableStore[fieldName]}']`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (element as HTMLInputElement).focus();
      }
    }, 100);
  }

  // --- Tab Management ---
  setActiveTab(tab: 'details' | 'additional-info' | 'images') {
    this.activeTab = tab;
    
    // If switching to images tab, make sure we've loaded images
    if (tab === 'images' && this.selectedStore) {
      this.loadStoreImages();
    }
    
    // If switching to additional info tab, make sure we've loaded data
    if (tab === 'additional-info' && this.selectedStore) {
      this.loadAdditionalInfo();
    }
  }

  // --- Additional Info Management ---
  async loadAdditionalInfo() {
    if (!this.selectedStore) return;
    
    try {
      const additionalInfo = await this.supabaseService.getStoreAdditionalInfo(this.selectedStore.id);
      this.selectedStore.additionalInfo = additionalInfo || [];
      
      // Prepare text for editing - use the most recent one
      if (additionalInfo && additionalInfo.length > 0) {
        // Sort by created_at in descending order
        const sortedInfo = [...additionalInfo].sort((a, b) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        this.additionalInfoText = sortedInfo[0].content;
      } else {
        this.additionalInfoText = '';
      }
    } catch (error) {
      console.error('Error loading additional info:', error);
    }
  }

  startEditingAdditionalInfo() {
    this.additionalInfoEditing = true;
  }

  cancelAdditionalInfoEdit() {
    this.additionalInfoEditing = false;
    
    // Reset to original value
    if (this.selectedStore.additionalInfo && this.selectedStore.additionalInfo.length > 0) {
      const sortedInfo = [...this.selectedStore.additionalInfo].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      this.additionalInfoText = sortedInfo[0].content;
    } else {
      this.additionalInfoText = '';
    }
  }

  async saveAdditionalInfo() {
    if (!this.selectedStore) return;
    
    this.savingAdditionalInfo = true;
    
    try {
      // Create new entry - we always add a new record to maintain history
      const result = await this.supabaseService.addStoreAdditionalInfo({
        store_id: this.selectedStore.id,
        content: this.additionalInfoText,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Reload additional info
      await this.loadAdditionalInfo();
      
      this.additionalInfoEditing = false;
      this.showStatusMessage('success', 'Additional information saved successfully!');
    } catch (error) {
      console.error('Error saving additional info:', error);
      this.showStatusMessage('error', 'Failed to save additional information. Please try again.');
    } finally {
      this.savingAdditionalInfo = false;
    }
  }

  // --- Image Management ---
  async loadStoreImages() {
    if (!this.selectedStore) return;
    
    try {
      const images = await this.supabaseService.getStoreImages(this.selectedStore.id);
      this.storeImages = images || [];
    } catch (error) {
      console.error('Error loading store images:', error);
      this.showStatusMessage('error', 'Failed to load store images. Please try again later.');
    }
  }

  // --- Image Ordering Methods ---
  // Focus on paste area when clicked
  focusPasteArea(event: Event) {
    (event.target as HTMLElement).focus();
  }

  // --- Storefront Image Handling ---
  onStorefrontImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.storefrontFile = input.files[0];
      this.createStorefrontPreview();
    }
  }

  onStorefrontImagePasted(event: ClipboardEvent) {
    event.preventDefault();
    
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          this.storefrontFile = new File([blob], 'pasted-image.png', { type: 'image/png' });
          this.createStorefrontPreview();
          break;
        }
      }
    }
  }

  createStorefrontPreview() {
    if (!this.storefrontFile) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      this.ngZone.run(() => {
        this.storefrontPreviewSrc = e.target?.result as string;
      });
    };
    reader.readAsDataURL(this.storefrontFile);
  }

  cancelStorefrontUpload() {
    this.storefrontFile = null;
    this.storefrontPreviewSrc = null;
    this.storefrontAnnotation = '';
  }

  async uploadStorefrontImage() {
    if (!this.selectedStore || !this.storefrontFile) return;
    
    this.uploadingStorefront = true;
    
    try {
      // First, set all existing storefront images to false
      await this.clearExistingStorefrontImages();
      
      // Upload the new storefront image
      const result = await this.supabaseService.uploadStoreImage({
        store_id: this.selectedStore.id,
        file: this.storefrontFile,
        is_storefront: 'true',
        instructions: this.storefrontAnnotation
      });
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Reload images
      await this.loadStoreImages();
      
      this.cancelStorefrontUpload();
      this.showStatusMessage('success', 'Storefront image uploaded successfully!');
    } catch (error) {
      console.error('Error uploading storefront image:', error);
      this.showStatusMessage('error', 'Failed to upload storefront image. Please try again.');
    } finally {
      this.uploadingStorefront = false;
    }
  }

  // --- Regular Image Handling ---
  onRegularImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.regularFile = input.files[0];
      this.createRegularPreview();
    }
  }

  onRegularImagePasted(event: ClipboardEvent) {
    event.preventDefault();
    
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          this.regularFile = new File([blob], 'pasted-image.png', { type: 'image/png' });
          this.createRegularPreview();
          break;
        }
      }
    }
  }

  createRegularPreview() {
    if (!this.regularFile) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      this.ngZone.run(() => {
        this.regularPreviewSrc = e.target?.result as string;
      });
    };
    reader.readAsDataURL(this.regularFile);
  }

  cancelRegularUpload() {
    this.regularFile = null;
    this.regularPreviewSrc = null;
    this.regularAnnotation = '';
  }

  async uploadRegularImage() {
    if (!this.selectedStore || !this.regularFile) return;
    
    this.uploadingRegular = true;
    
    try {
      const result = await this.supabaseService.uploadStoreImage({
        store_id: this.selectedStore.id,
        file: this.regularFile,
        is_storefront: 'false',
        instructions: this.regularAnnotation
      });
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Reload images
      await this.loadStoreImages();
      
      this.cancelRegularUpload();
      this.showStatusMessage('success', 'Image uploaded successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
      this.showStatusMessage('error', 'Failed to upload image. Please try again.');
    } finally {
      this.uploadingRegular = false;
    }
  }
  
  // --- Image Actions ---
  async deleteImage(image: any) {
    if (!confirm('Are you sure you want to delete this image?')) {
      return;
    }
    
    try {
      const result = await this.supabaseService.deleteStoreImage(image.id);
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Reload images
      await this.loadStoreImages();
      
      this.showStatusMessage('success', 'Image deleted successfully!');
    } catch (error) {
      console.error('Error deleting image:', error);
      this.showStatusMessage('error', 'Failed to delete image. Please try again.');
    }
  }

  async setAsStorefront(image: any) {
    try {
      // First, set all existing storefront images to false
      await this.clearExistingStorefrontImages();
      
      // Then, set this image as the storefront
      const result = await this.supabaseService.updateStoreImage({
        id: image.id,
        is_storefront: 'true'
      });
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Reload images
      await this.loadStoreImages();
      
      this.showStatusMessage('success', 'Image set as storefront successfully!');
    } catch (error) {
      console.error('Error setting image as storefront:', error);
      this.showStatusMessage('error', 'Failed to set image as storefront. Please try again.');
    }
  }

  async editImageAnnotation(image: any) {
    const newAnnotation = prompt('Enter image annotation:', image.instructions || '');
    
    if (newAnnotation === null) return; // User cancelled
    
    try {
      const result = await this.supabaseService.updateStoreImage({
        id: image.id,
        instructions: newAnnotation
      });
      
      if (result && 'error' in result && result.error) {
        throw new Error(result.error.toString());
      }
      
      // Reload images
      await this.loadStoreImages();
      
      this.showStatusMessage('success', 'Image annotation updated successfully!');
    } catch (error) {
      console.error('Error updating image annotation:', error);
      this.showStatusMessage('error', 'Failed to update image annotation. Please try again.');
    }
  }

  // Helper to clear all storefront flags
  async clearExistingStorefrontImages() {
    if (!this.selectedStore) return;
    
    try {
      // Find existing storefront images
      const storefrontImages = this.storeImages.filter(img => img.is_storefront === 'true');
      
      for (const img of storefrontImages) {
        await this.supabaseService.updateStoreImage({
          id: img.id,
          is_storefront: 'false'
        });
      }
    } catch (error) {
      console.error('Error clearing existing storefront images:', error);
      throw error;
    }
  }

  // Load route details from store_orders
  async loadRouteDetails() {
    if (!this.selectedStore || !this.selectedStore.store_code) {
      return;
    }
    
    try {
      const routeDetails = await this.supabaseService.getStoreRouteDetails(
        this.selectedStore.store_code,
        this.selectedStore.store_name
      );
      
      if (routeDetails) {
        this.selectedStore.route_details = routeDetails;
      }
    } catch (error) {
      console.error('Error loading route details:', error);
    }
  }

  // --- Utility Functions ---
  showStatusMessage(type: 'success' | 'error' | 'warning' | 'info', text: string) {
    this.statusMessage = {
      show: true,
      type,
      text
    };
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
      this.statusMessage.show = false;
    }, 4000);
  }
}
