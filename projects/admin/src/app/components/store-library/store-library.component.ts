import { Component, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

interface StoreData {
  id?: number;
  store_code: string;
  dispatch_code: string;
  store_address: string;
  opening_time_weekdays: string;
  opening_time_sat: string;
  openining_time_bankholiday: string;
  route: string;
  hour_access_24?: string;
  deliver_monday?: string;
  deliver_tuesday?: string;
  deliver_wednesday?: string;
  deliver_thursday?: string;
  deliver_friday?: string;
  deliver_saturday?: string;
  isEditing?: boolean;
}

@Component({
  selector: 'app-store-library',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
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

  // Excel spreadsheet data
  stores: StoreData[] = [];
  editingRowId: number | null = null;
  error: string | null = null;
  
  // Pagination properties
  currentPage = 1;
  pageSize = 50;
  totalStores = 0;
  totalPages = 0;

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
  savingDeliveryDayInTable: string | null = null;
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

  // Route filter properties
  availableRoutes: string[] = [];
  selectedRoutes: Set<string> = new Set();
  showRouteFilter: boolean = false;
  originalStores: StoreData[] = []; // Store original unfiltered data
  isFiltering: boolean = false; // Track if we're currently filtering
  allStoresForFiltering: StoreData[] = []; // All stores from database for filtering
  
  // 24-hour filter properties
  show24HourFilter: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private ngZone: NgZone
  ) { }
  
  ngOnInit(): void {
    this.loadStoresForSpreadsheet();
    this.loadTotalCount();
    this.loadAllStores();
    // Try to load compact mode preference from localStorage
    const savedCompactMode = localStorage.getItem('storeLibraryCompactMode');
    if (savedCompactMode !== null) {
      this.compactMode = savedCompactMode === 'true';
    }
  }

  // Excel spreadsheet methods
  async loadTotalCount() {
    try {
      const { count, error } = await this.supabaseService.getSupabase()
        .from('stores')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      
      this.totalStores = count || 0;
      this.totalPages = Math.ceil(this.totalStores / this.pageSize);
    } catch (error: any) {
      console.error('Error loading total count:', error);
    }
  }

  async loadStoresForSpreadsheet() {
    this.loading = true;
    this.error = null;
    
    try {
      if (this.isFiltering) {
        // When filtering, show filtered results without pagination
        this.stores = [...this.allStoresForFiltering];
        this.extractAvailableRoutes();
      } else {
        // Normal pagination when not filtering
        const startIndex = (this.currentPage - 1) * this.pageSize;
        
        // Load stores from Supabase with pagination
        const { data, error } = await this.supabaseService.getSupabase()
          .from('stores')
          .select('*')
          .order('store_code')
          .range(startIndex, startIndex + this.pageSize - 1);

        if (error) throw error;

        this.stores = data?.map(store => ({
          id: store.id,
          store_code: store.store_code || '',
          dispatch_code: store.dispatch_code || '',
          store_address: store.address_line || '',
          opening_time_weekdays: store.opening_time_weekdays || '',
          opening_time_sat: store.opening_time_sat || '',
          openining_time_bankholiday: store.openining_time_bankholiday || '',
          route: store.route || '',
          hour_access_24: store.hour_access_24 || '',
          deliver_monday: store.deliver_monday || '',
          deliver_tuesday: store.deliver_tuesday || '',
          deliver_wednesday: store.deliver_wednesday || '',
          deliver_thursday: store.deliver_thursday || '',
          deliver_friday: store.deliver_friday || '',
          deliver_saturday: store.deliver_saturday || '',
          isEditing: false
        })) || [];

        // Store original data and extract routes
        this.originalStores = [...this.stores];
        this.extractAvailableRoutes();
      }

    } catch (error: any) {
      this.error = 'Failed to load stores: ' + error.message;
      console.error('Error loading stores:', error);
    } finally {
      this.loading = false;
    }
  }

  // Pagination methods
  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.loadStoresForSpreadsheet();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadStoresForSpreadsheet();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadStoresForSpreadsheet();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getEndIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalStores);
  }

  addNewRow() {
    const newStore: StoreData = {
      store_code: '',
      dispatch_code: '',
      store_address: '',
      opening_time_weekdays: '',
      opening_time_sat: '',
      openining_time_bankholiday: '',
      route: '',
      hour_access_24: '',
      deliver_monday: '',
      deliver_tuesday: '',
      deliver_wednesday: '',
      deliver_thursday: '',
      deliver_friday: '',
      deliver_saturday: '',
      isEditing: true
    };
    this.stores.unshift(newStore);
    this.editingRowId = -1; // Use -1 for new rows
  }

  editRow(index: number) {
    this.cancelEdit(); // Cancel any existing edits
    this.stores[index].isEditing = true;
    this.editingRowId = this.stores[index].id || index;
  }

  async saveRow(index: number) {
    const store = this.stores[index];
    this.loading = true;
    this.error = null;

    try {
      const updateData = {
        store_code: store.store_code,
        dispatch_code: store.dispatch_code,
        address_line: store.store_address,
        opening_time_weekdays: store.opening_time_weekdays,
        opening_time_sat: store.opening_time_sat,
        openining_time_bankholiday: store.openining_time_bankholiday,
        route: store.route,
        hour_access_24: store.hour_access_24,
        deliver_monday: store.deliver_monday,
        deliver_tuesday: store.deliver_tuesday,
        deliver_wednesday: store.deliver_wednesday,
        deliver_thursday: store.deliver_thursday,
        deliver_friday: store.deliver_friday,
        deliver_saturday: store.deliver_saturday
      };

      if (store.id) {
        // Update existing store
        const { error } = await this.supabaseService.getSupabase()
          .from('stores')
          .update(updateData)
          .eq('id', store.id);

        if (error) throw error;
      } else {
        // Insert new store
        const { data, error } = await this.supabaseService.getSupabase()
          .from('stores')
          .insert(updateData)
          .select()
          .single();

        if (error) throw error;
        store.id = data.id;
        
        // Reload total count after adding new store
        await this.loadTotalCount();
      }

      store.isEditing = false;
      this.editingRowId = null;
    } catch (error: any) {
      this.error = 'Failed to save store: ' + error.message;
      console.error('Error saving store:', error);
    } finally {
      this.loading = false;
    }
  }

  cancelEdit() {
    if (this.editingRowId === -1) {
      // Remove the new row if it was being added
      this.stores = this.stores.filter(store => store.id !== undefined);
    } else {
      // Reset editing state for existing rows
      this.stores.forEach(store => store.isEditing = false);
    }
    this.editingRowId = null;
  }

  async deleteRow(index: number) {
    const store = this.stores[index];
    if (!store.id) {
      // Just remove from array if it's a new unsaved row
      this.stores.splice(index, 1);
      return;
    }

    if (confirm('Are you sure you want to delete this store?')) {
      this.loading = true;
      this.error = null;

      try {
        const { error } = await this.supabaseService.getSupabase()
          .from('stores')
          .delete()
          .eq('id', store.id);

        if (error) throw error;
        this.stores.splice(index, 1);
        
        // Reload total count and current page after deletion
        await this.loadTotalCount();
        
        // If current page is empty and not the first page, go to previous page
        if (this.stores.length === 0 && this.currentPage > 1) {
          this.currentPage--;
        }
        
        this.loadStoresForSpreadsheet();
      } catch (error: any) {
        this.error = 'Failed to delete store: ' + error.message;
        console.error('Error deleting store:', error);
      } finally {
        this.loading = false;
      }
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
        // Extract routes from all stores for the filter
        this.extractAvailableRoutesFromAllStores();
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
    // Directly select the store instead of showing search results
    this.selectStore(suggestion);
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

  // View store details from table row
  async viewStoreDetails(store: StoreData) {
    if (!store.id) {
      this.showStatusMessage('error', 'Cannot view details for unsaved store.');
      return;
    }
    
    // Use the existing selectStore method but pass the store data in the expected format
    await this.selectStore({ id: store.id });
  }

  clearSelectedStore() {
    this.selectedStore = null;
    this.editableStore = null;
    this.editMode = false;
    this.activeTab = 'details';
  }

  // Update delivery day checkbox value
  updateDeliveryDay(dayField: string, event: any): void {
    if (!this.editableStore) return;
    
    // Set the field value to 'yes' if checked, 'no' if unchecked
    this.editableStore[dayField] = event.target.checked ? 'yes' : 'no';
  }

  // Update delivery day checkbox value in table
  updateDeliveryDayInTable(store: StoreData, dayField: string, event: any): void {
    // Set the field value to 'yes' if checked, 'no' if unchecked
    (store as any)[dayField] = event.target.checked ? 'yes' : 'no';
  }

  // Generate unique key for tracking saving state per store and day
  getStoreDeliveryKey(store: StoreData, dayField: string): string {
    return `${store.id}_${dayField}`;
  }

  // Toggle delivery day by clicking on the circle in table
  async toggleDeliveryDayInTable(store: StoreData, dayField: string): Promise<void> {
    if (!store.id || this.savingDeliveryDayInTable) return;
    
    try {
      // Set the saving state for visual feedback
      this.savingDeliveryDayInTable = this.getStoreDeliveryKey(store, dayField);
      
      // Toggle the current value
      const currentValue = (store as any)[dayField] === 'yes' ? 'no' : 'yes';
      
      // Optimistically update the UI
      (store as any)[dayField] = currentValue;
      
      // Create the update data for Supabase
      const updateData = {
        [dayField]: currentValue
      };
      
      // Save to Supabase
      const { error } = await this.supabaseService.getSupabase()
        .from('stores')
        .update(updateData)
        .eq('id', store.id);
      
      if (error) throw error;
      
      // Update the store in other arrays if they exist
      this.updateStoreInArrays(store.id.toString(), { [dayField]: currentValue });
      
      // Show brief success feedback
      // this.showTableDeliveryUpdateStatus('success', `Updated delivery schedule for ${store.store_code}`);
    } catch (error) {
      console.error(`Error toggling delivery day ${dayField} for store ${store.store_code}:`, error);
      
      // Revert the UI change on failure
      (store as any)[dayField] = (store as any)[dayField] === 'yes' ? 'no' : 'yes';
      
      this.showTableDeliveryUpdateStatus('error', `Failed to update delivery day. Please try again.`);
    } finally {
      // Clear the saving state
      setTimeout(() => {
        this.savingDeliveryDayInTable = null;
      }, 300);
    }
  }

  // Show delivery update status for table operations
  private showTableDeliveryUpdateStatus(type: 'success' | 'error', text: string): void {
    this.dayUpdateStatus = {
      show: true,
      type,
      text
    };
    
    // Auto-hide after 2 seconds
    setTimeout(() => {
      this.dayUpdateStatus.show = false;
    }, 2000);
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
    if (this.editMode) {
      this.cancelEdit();
    } else {
      this.editMode = true;
      this.editableStore = { ...this.selectedStore };
    }
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

  // Route filter methods
  extractAvailableRoutes() {
    const routes = new Set<string>();
    this.originalStores.forEach(store => {
      if (store.route && store.route.trim()) {
        routes.add(store.route.trim());
      }
    });
    this.availableRoutes = Array.from(routes).sort();
  }

  async toggleRouteFilter() {
    this.showRouteFilter = !this.showRouteFilter;
    
    // Load all stores for filtering if not already loaded
    if (this.showRouteFilter && this.allStoresForFiltering.length === 0) {
      await this.loadAllStoresForFiltering();
      // Extract routes from all stores
      this.extractAvailableRoutesFromAllStores();
    }
  }

  async toggleRouteSelection(route: string) {
    if (this.selectedRoutes.has(route)) {
      this.selectedRoutes.delete(route);
    } else {
      this.selectedRoutes.add(route);
    }
    
    // Reload all stores for filtering if needed
    if (this.allStoresForFiltering.length === 0) {
      await this.loadAllStoresForFiltering();
    }
    
    this.applyRouteFilter();
  }

  async selectAllRoutes() {
    this.selectedRoutes = new Set(this.availableRoutes);
    
    // Reload all stores for filtering if needed
    if (this.allStoresForFiltering.length === 0) {
      await this.loadAllStoresForFiltering();
    }
    
    this.applyRouteFilter();
  }

  async clearAllRoutes() {
    this.selectedRoutes.clear();
    this.applyRouteFilter();
  }

  applyRouteFilter() {
    if (this.selectedRoutes.size === 0 && !this.show24HourFilter) {
      // No filters active, return to normal pagination
      this.isFiltering = false;
      this.currentPage = 1;
      this.loadStoresForSpreadsheet();
    } else {
      // Apply filters
      this.isFiltering = true;
      let filteredStores = this.allStoresForFiltering;
      
      // Apply route filter if routes are selected
      if (this.selectedRoutes.size > 0) {
        filteredStores = filteredStores.filter(store => 
          store.route && this.selectedRoutes.has(store.route.trim())
        );
      }
      
      // Apply 24-hour filter if active
      if (this.show24HourFilter) {
        filteredStores = filteredStores.filter(store => 
          this.is24HourStore(store)
        );
      }
      
      this.stores = filteredStores;
    }
  }

  getSelectedRoutesCount(): number {
    return this.selectedRoutes.size;
  }

  // New method to extract routes from all stores for the filter
  extractAvailableRoutesFromAllStores() {
    const routes = new Set<string>();
    this.allStoresForFiltering.forEach(store => {
      if (store.route && store.route.trim()) {
        routes.add(store.route.trim());
      }
    });
    this.availableRoutes = Array.from(routes).sort();
  }

  // Load all stores for filtering
  async loadAllStoresForFiltering() {
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('stores')
        .select('*')
        .order('store_code');

      if (error) throw error;

      this.allStoresForFiltering = data?.map(store => ({
        id: store.id,
        store_code: store.store_code || '',
        dispatch_code: store.dispatch_code || '',
        store_address: store.address_line || '',
        opening_time_weekdays: store.opening_time_weekdays || '',
        opening_time_sat: store.opening_time_sat || '',
        openining_time_bankholiday: store.openining_time_bankholiday || '',
        route: store.route || '',
        hour_access_24: store.hour_access_24 || '',
        deliver_monday: store.deliver_monday || '',
        deliver_tuesday: store.deliver_tuesday || '',
        deliver_wednesday: store.deliver_wednesday || '',
        deliver_thursday: store.deliver_thursday || '',
        deliver_friday: store.deliver_friday || '',
        deliver_saturday: store.deliver_saturday || '',
        isEditing: false
      })) || [];

    } catch (error: any) {
      console.error('Error loading all stores for filtering:', error);
    }
  }

  // 24-hour filter methods
  async toggle24HourFilter() {
    this.show24HourFilter = !this.show24HourFilter;
    
    // Load all stores for filtering if not already loaded
    if (this.show24HourFilter && this.allStoresForFiltering.length === 0) {
      await this.loadAllStoresForFiltering();
    }
    
    this.applyRouteFilter();
  }

  private is24HourStore(store: StoreData): boolean {
    // Check the dedicated hour_access_24 column for 'Y' value
    return store.hour_access_24 === 'Y';
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
