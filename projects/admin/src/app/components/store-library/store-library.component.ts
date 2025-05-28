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

  // CSV Export/Import functionality
  exportingCSV: boolean = false;
  importingCSV: boolean = false;
  exportProgress: number = 0;
  exportProgressMessage: string = '';
  importProgress: number = 0;
  importProgressMessage: string = '';

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
      // Load images from store_images table (actual uploaded images)
      const uploadedImages = await this.supabaseService.getStoreImages(this.selectedStore.id);
      
      // Start with uploaded images
      this.storeImages = uploadedImages || [];
      
      // Also check if there are image codes in the store's images column
      if (this.selectedStore.images) {
        try {
          let imageData: any[] = [];
          
          // Parse the images column (could be enhanced format or legacy format)
          if (typeof this.selectedStore.images === 'string') {
            try {
              imageData = JSON.parse(this.selectedStore.images);
            } catch (e) {
              // If it's not valid JSON, treat as a single image code (legacy)
              imageData = [{ code: this.selectedStore.images, url: '', is_storefront: false, instructions: '' }];
            }
          } else if (Array.isArray(this.selectedStore.images)) {
            imageData = this.selectedStore.images;
          }
          
          // Process each image data entry
          if (imageData.length > 0) {
            const additionalImages: any[] = [];
            
            for (const imgData of imageData) {
              let code: string;
              let url: string = '';
              let isStorefront: boolean = false;
              let instructions: string = '';
              
              // Handle both enhanced format (objects) and legacy format (strings)
              if (typeof imgData === 'object' && imgData.code) {
                // Enhanced format
                code = imgData.code;
                url = imgData.url || '';
                isStorefront = imgData.is_storefront || false;
                instructions = imgData.instructions || '';
              } else if (typeof imgData === 'string') {
                // Legacy format - just a code
                code = imgData;
              } else {
                continue; // Skip invalid entries
              }
              
              // Try to find this image in the uploaded images
              const matchingImage = this.storeImages.find(img => 
                img.file_name && (img.file_name.includes(code) || img.file_name === code)
              );
              
              if (matchingImage) {
                // Image found in store_images table - it's already in this.storeImages
                // Update any missing information from the CSV data
                if (url && !matchingImage.url) {
                  matchingImage.url = url;
                }
                if (instructions && !matchingImage.instructions) {
                  matchingImage.instructions = instructions;
                }
                continue;
              } else if (url) {
                // We have a URL from CSV but no matching uploaded image
                // Create a virtual image entry that points to the URL
                additionalImages.push({
                  id: `csv_${code}`,
                  store_id: this.selectedStore.id,
                  file_path: '',
                  url: url,
                  file_name: code,
                  is_storefront: isStorefront ? 'true' : 'false',
                  instructions: instructions || 'Image from CSV import',
                  uploaded_at: new Date().toISOString(),
                  isFromCSV: true // Flag to identify CSV-imported images
                });
              } else {
                // Image code exists but no URL and no corresponding uploaded image
                // Create a placeholder
                additionalImages.push({
                  id: `placeholder_${code}`,
                  store_id: this.selectedStore.id,
                  file_path: '',
                  url: '', // Empty URL indicates this is a placeholder
                  file_name: code,
                  is_storefront: 'false',
                  instructions: instructions || 'Image code from CSV import - actual image file not found',
                  uploaded_at: new Date().toISOString(),
                  isPlaceholder: true // Flag to identify placeholder entries
                });
              }
            }
            
            // Add additional images to the list
            this.storeImages = [...this.storeImages, ...additionalImages];
          }
        } catch (error) {
          console.warn('Error parsing images column:', error);
        }
      }
      
      // If we have no images at all, check if there are any orphaned images in store_images
      // that might not be properly linked to the store's images column
      if (this.storeImages.length === 0) {
        // Try to get any images for this store that might exist
        const orphanedImages = await this.supabaseService.getStoreImages(this.selectedStore.id);
        if (orphanedImages && orphanedImages.length > 0) {
          this.storeImages = orphanedImages;
          
          // Update the store's images column to include these image codes
          await this.syncImageCodesToStore(orphanedImages);
        }
      }
    } catch (error) {
      console.error('Error loading store images:', error);
      this.showStatusMessage('error', 'Failed to load store images. Please try again later.');
    }
  }
  
  // Helper method to sync image codes back to the store's images column
  private async syncImageCodesToStore(images: any[]) {
    if (!this.selectedStore || !images || images.length === 0) return;
    
    try {
      // Generate image codes for existing images that might not have them
      const imageCodes = images.map(img => {
        // Try to extract or generate an image code
        if (img.file_name) {
          // Use the filename as the image code
          return img.file_name;
        } else {
          // Generate a new code
          return `IMG_${this.selectedStore.id.substring(0, 8)}_${Date.now().toString(36)}`;
        }
      });
      
      // Update the store's images column
      const { error } = await this.supabaseService.getSupabase()
        .from('stores')
        .update({ images: JSON.stringify(imageCodes) })
        .eq('id', this.selectedStore.id);
      
      if (error) {
        console.error('Error syncing image codes to store:', error);
      } else {
        // Update the local store data
        this.selectedStore.images = JSON.stringify(imageCodes);
      }
    } catch (error) {
      console.error('Error syncing image codes:', error);
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

  // --- CSV Export/Import Methods ---
  
  async exportToCSV() {
    console.log('Export CSV started'); // Debug log
    this.exportingCSV = true;
    this.exportProgress = 0;
    this.exportProgressMessage = 'Initializing export...';
    console.log('Export state set:', { exportingCSV: this.exportingCSV, exportProgress: this.exportProgress }); // Debug log
    
    try {
      // Step 1: Get all stores (10%)
      this.exportProgressMessage = 'Loading store data...';
      this.exportProgress = 10;
      
      const allStores = await this.supabaseService.getStoreInformation();
      
      if (!allStores || allStores.length === 0) {
        this.showStatusMessage('error', 'No stores found to export.');
        return;
      }

      // Step 2: Get ALL store images in one batch query (30%)
      this.exportProgressMessage = `Loading images for ${allStores.length} stores...`;
      this.exportProgress = 30;
      
      // Get all store images in one query instead of individual queries
      const { data: allStoreImages, error: imagesError } = await this.supabaseService.getSupabase()
        .from('store_images')
        .select('*');
      
      if (imagesError) {
        console.warn('Error loading store images:', imagesError);
      }
      
      // Group images by store_id for quick lookup
      const imagesByStoreId: { [key: string]: any[] } = {};
      if (allStoreImages) {
        allStoreImages.forEach(img => {
          if (!imagesByStoreId[img.store_id]) {
            imagesByStoreId[img.store_id] = [];
          }
          imagesByStoreId[img.store_id].push(img);
        });
      }

      // Step 3: Process all stores efficiently (60%)
      this.exportProgressMessage = 'Processing store data...';
      this.exportProgress = 60;

      // Prepare CSV headers
      const headers = [
        'id', 'store_code', 'dispatch_code', 'dispatch_store_name', 'site_id',
        'store_company', 'store_name', 'address_line', 'city', 'county', 'eircode',
        'latitude', 'longitude', 'route', 'alarm_code', 'fridge_code',
        'keys_available', 'key_code', 'prior_registration_required', 'hour_access_24',
        'deliver_monday', 'deliver_tuesday', 'deliver_wednesday', 'deliver_thursday',
        'deliver_friday', 'deliver_saturday', 'opening_time_weekdays', 'opening_time_sat',
        'opening_time_sun', 'openining_time_bankholiday', 'email', 'phone',
        'images'
      ];

      // Process all stores in batches for better performance
      const csvData = [];
      const batchSize = 100; // Process 100 stores at a time
      
      for (let i = 0; i < allStores.length; i += batchSize) {
        const batch = allStores.slice(i, i + batchSize);
        const batchProgress = Math.floor((i / allStores.length) * 30); // 30% of progress for processing
        this.exportProgress = 60 + batchProgress;
        this.exportProgressMessage = `Processing stores ${i + 1} to ${Math.min(i + batchSize, allStores.length)} of ${allStores.length}...`;
        
        // Process batch
        for (const store of batch) {
          const row: any = {};
          
          // Fill in all the regular fields
          headers.forEach(header => {
            if (header !== 'images') {
              row[header] = store[header] || '';
            }
          });
          
          // Handle images efficiently using pre-loaded data
          const storeImages = imagesByStoreId[store.id] || [];
          
          if (storeImages.length > 0) {
            // Create enhanced image data with both codes and URLs
            const imageData = storeImages.map(img => ({
              code: img.file_name || `IMG_${store.id.substring(0, 8)}_${Date.now().toString(36)}`,
              url: img.url,
              is_storefront: img.is_storefront === 'true',
              instructions: img.instructions || ''
            }));
            
            row.images = JSON.stringify(imageData);
          } else {
            // Check if there are image codes in the store's images column
            if (store.images) {
              try {
                let imageCodes = [];
                if (typeof store.images === 'string') {
                  imageCodes = JSON.parse(store.images);
                } else if (Array.isArray(store.images)) {
                  imageCodes = store.images;
                }
                
                // Convert simple codes to enhanced format
                const imageData = imageCodes.map((code: string) => ({
                  code: code,
                  url: '',
                  is_storefront: false,
                  instructions: 'Image code only - actual image file not found'
                }));
                
                row.images = JSON.stringify(imageData);
              } catch (e) {
                row.images = '[]';
              }
            } else {
              row.images = '[]';
            }
          }
          
          csvData.push(row);
        }
        
        // Small delay to allow UI updates (much smaller than before)
        if (i % (batchSize * 5) === 0) { // Only delay every 500 stores
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Step 4: Convert to CSV (95%)
      this.exportProgressMessage = 'Converting to CSV format...';
      this.exportProgress = 95;
      
      const csvContent = this.convertToCSV(csvData, headers);
      
      // Step 5: Download (100%)
      this.exportProgressMessage = 'Preparing download...';
      this.exportProgress = 98;
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      const today = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `stores-export-${today}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.exportProgressMessage = 'Export completed!';
      this.exportProgress = 100;
      
      // Show completion message
      setTimeout(() => {
        this.showStatusMessage('success', `Successfully exported ${allStores.length} stores to CSV with image data.`);
      }, 500);
      
    } catch (error) {
      console.error('Error exporting CSV:', error);
      this.showStatusMessage('error', 'Failed to export CSV. Please try again.');
    } finally {
      // Reset progress after a delay
      setTimeout(() => {
        this.exportingCSV = false;
        this.exportProgress = 0;
        this.exportProgressMessage = '';
      }, 1500);
    }
  }

  onCSVFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      this.importFromCSV(file);
    } else {
      this.showStatusMessage('error', 'Please select a valid CSV file.');
    }
    // Reset the input
    event.target.value = '';
  }

  async importFromCSV(file: File) {
    this.importingCSV = true;
    this.importProgress = 0;
    this.importProgressMessage = 'Reading CSV file...';
    
    try {
      this.importProgress = 10;
      const csvText = await this.readFileAsText(file);
      
      this.importProgressMessage = 'Parsing CSV data...';
      this.importProgress = 20;
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const parsedData = this.parseCSV(csvText);
      
      if (!parsedData || parsedData.length === 0) {
        this.showStatusMessage('error', 'No valid data found in CSV file.');
        return;
      }

      this.importProgressMessage = `Processing ${parsedData.length} stores...`;
      this.importProgress = 30;
      await new Promise(resolve => setTimeout(resolve, 100));

      // Validate and process the images column
      const validatedData = parsedData.map((row, index) => {
        // Update progress for validation
        if (index % 10 === 0) {
          const validationProgress = Math.floor((index / parsedData.length) * 30); // 30% for validation
          this.importProgress = 30 + validationProgress;
          this.importProgressMessage = `Validating store ${index + 1} of ${parsedData.length}...`;
        }
        
        if (row.images) {
          try {
            // Parse the images data
            const imageData = JSON.parse(row.images);
            
            if (Array.isArray(imageData)) {
              // Check if it's the new enhanced format (objects with code, url, etc.)
              // or the old format (simple array of strings)
              const isEnhancedFormat = imageData.length > 0 && 
                typeof imageData[0] === 'object' && 
                imageData[0].hasOwnProperty('code');
              
              if (isEnhancedFormat) {
                // New enhanced format - validate structure
                const validImageData = imageData.filter(img => 
                  img && typeof img === 'object' && img.code
                );
                row.images = JSON.stringify(validImageData);
                
                // Store the enhanced data for potential image recreation
                row._imageData = validImageData;
              } else {
                // Old format - array of strings (image codes)
                // Convert to enhanced format for consistency
                const enhancedImageData = imageData.map((code: string) => ({
                  code: code,
                  url: '', // No URL in old format
                  is_storefront: false,
                  instructions: 'Imported from legacy CSV format'
                }));
                row.images = JSON.stringify(enhancedImageData);
                row._imageData = enhancedImageData;
              }
            } else {
              console.warn(`Invalid images format for store ${row.store_name || row.id}: not an array`);
              row.images = '[]';
              row._imageData = [];
            }
          } catch (e) {
            console.warn(`Invalid images JSON for store ${row.store_name || row.id}: ${row.images}`);
            row.images = '[]';
            row._imageData = [];
          }
        } else {
          row.images = '[]';
          row._imageData = [];
        }
        return row;
      });

      this.importProgressMessage = 'Updating store information in database...';
      this.importProgress = 70;
      await new Promise(resolve => setTimeout(resolve, 200));

      // Update stores using the existing method
      const results = await this.supabaseService.updateStoreInformation(validatedData);
      
      this.importProgressMessage = 'Finalizing import...';
      this.importProgress = 90;
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      
      if (successCount > 0) {
        this.importProgressMessage = 'Import completed successfully!';
        this.importProgress = 100;
        
        setTimeout(() => {
          this.showStatusMessage('success', 
            `Successfully imported ${successCount} stores with image data. ${errorCount > 0 ? `${errorCount} failed.` : ''}`);
        }, 500);
        
        // Reload the stores data
        await this.loadStoresForSpreadsheet();
        
        // If there's a selected store, reload its images to reflect any changes
        if (this.selectedStore) {
          await this.loadStoreImages();
        }
      } else {
        this.showStatusMessage('error', 'Failed to import any stores. Please check the CSV format.');
      }
      
    } catch (error) {
      console.error('Error importing CSV:', error);
      this.showStatusMessage('error', 'Failed to import CSV. Please check the file format.');
    } finally {
      // Reset progress after a delay
      setTimeout(() => {
        this.importingCSV = false;
        this.importProgress = 0;
        this.importProgressMessage = '';
      }, 1500);
    }
  }

  private convertToCSV(data: any[], headers: string[]): string {
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.map(header => `"${header}"`).join(','));
    
    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header] || '';
        // Escape quotes and wrap in quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }

  private parseCSV(csvText: string): any[] {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(header => header.replace(/"/g, '').trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }
    
    return data;
  }

  private parseCSVLine(line: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }
}
