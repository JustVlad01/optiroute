import { Component, OnInit, HostListener, OnDestroy, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Subject, Subscription } from 'rxjs';

@Component({
  selector: 'app-store-masterfile',
  templateUrl: './store-masterfile.component.html',
  styleUrls: ['./store-masterfile.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule]
})
export class StoreMasterfileComponent implements OnInit, OnDestroy {
  storeData: any[] = [];
  filteredData: any[] = [];
  pagedData: any[] = [];
  loading: boolean = true;
  allColumns: string[] = []; // All available columns
  columns: string[] = []; // Currently visible columns
  columnVisibility: {[key: string]: boolean} = {}; // Track which columns are visible
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  searchTerm: string = '';
  totalStoreCount: number = 0;
  
  // Column resizing properties
  columnWidths: {[key: string]: number} = {}; // Track column widths
  currentResizeColumn: string | null = null;
  startX: number = 0;
  startWidth: number = 0;
  isResizing: boolean = false;
  private readonly STORAGE_KEY = 'store_masterfile_column_widths';
  private readonly VISIBILITY_STORAGE_KEY = 'store_masterfile_column_visibility';
  
  // Edit mode
  editMode: boolean = true; // Default to edit mode
  editedCells: { [key: string]: any } = {}; // Track edited cells
  editedRows: Set<number> = new Set(); // Track which rows have been edited
  isSaving: boolean = false;
  saveSuccess: boolean = false;
  saveError: boolean = false;
  lastSavedTime: Date | null = null;
  
  // Column visibility modal
  showColumnModal: boolean = false;
  
  // Filters
  show24HoursOnly: boolean = false;
  
  // Pagination properties
  currentPage: number = 1;
  itemsPerPage: number = 40;
  totalPages: number = 1;

  // Route filter properties
  allRoutes: string[] = [];
  selectedRoutes: {[key: string]: boolean} = {};
  showRouteFilter: boolean = false; // Controls the visibility of the route filter dropdown
  
  // Segregated routes tracking
  segregatedRoutes: {[key: string]: boolean} = {};
  showSegregatedRoutes: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    this.loadColumnWidthsFromStorage();
    this.loadStoreData();
  }
  
  ngOnDestroy(): void {
    // Clean up event listeners when component is destroyed
    document.removeEventListener('mousemove', this.onMouseMoveResize);
    document.removeEventListener('mouseup', this.onMouseUpResize);
  }

  // Load column widths from localStorage
  loadColumnWidthsFromStorage(): void {
    try {
      const savedWidths = localStorage.getItem(this.STORAGE_KEY);
      if (savedWidths) {
        this.columnWidths = JSON.parse(savedWidths);
      }
      
      // Also load column visibility
      const savedVisibility = localStorage.getItem(this.VISIBILITY_STORAGE_KEY);
      if (savedVisibility) {
        this.columnVisibility = JSON.parse(savedVisibility);
      }
    } catch (error) {
      console.error('Error loading column settings from localStorage:', error);
    }
  }

  // Save column widths to localStorage
  saveColumnWidthsToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.columnWidths));
    } catch (error) {
      console.error('Error saving column widths to localStorage:', error);
    }
  }
  
  // Save column visibility to localStorage
  saveColumnVisibilityToStorage(): void {
    try {
      localStorage.setItem(this.VISIBILITY_STORAGE_KEY, JSON.stringify(this.columnVisibility));
    } catch (error) {
      console.error('Error saving column visibility to localStorage:', error);
    }
  }

  // Column resizing methods
  startResize(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    this.isResizing = true;
    this.currentResizeColumn = column;
    this.startX = event.pageX;
    this.startWidth = this.columnWidths[column] || 150;
    
    // Add event listeners to handle resize
    document.addEventListener('mousemove', this.onMouseMoveResize);
    document.addEventListener('mouseup', this.onMouseUpResize);
    
    // Add the resizing class to the body to change cursor during resize
    document.body.classList.add('resizing');
  }
  
  // Need to use arrow functions to maintain 'this' context
  onMouseMoveResize = (event: MouseEvent): void => {
    if (!this.isResizing || !this.currentResizeColumn) return;
    
    const diff = event.pageX - this.startX;
    const newWidth = Math.max(50, this.startWidth + diff); // Min width of 50px
    
    this.columnWidths[this.currentResizeColumn] = newWidth;
    
    // Force Angular to detect the change and update the DOM
    this.applyColumnWidths();
  }
  
  // Force Angular change detection for column width updates
  applyColumnWidths(): void {
    // Trigger change detection by creating a new object reference
    this.columnWidths = { ...this.columnWidths };
  }
  
  onMouseUpResize = (): void => {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.classList.remove('resizing');
      
      // Remove event listeners when done
      document.removeEventListener('mousemove', this.onMouseMoveResize);
      document.removeEventListener('mouseup', this.onMouseUpResize);
      
      this.currentResizeColumn = null;
      
      // Save column widths to localStorage after resizing is complete
      this.saveColumnWidthsToStorage();
    }
  }

  async loadStoreData(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.supabaseService.getStoreInformation();
      if (data) {
        // Standardize column names for UI display
        this.storeData = this.standardizeColumnNames(data);
        
        // Get the total count directly from the service
        this.totalStoreCount = this.supabaseService.getTotalStoreCount() || data.length;
        console.log('Total store count in component:', this.totalStoreCount);
        this.filteredData = [...this.storeData]; // Initialize filtered data with all data
        
        // Extract column names from the first data item if available
        if (this.storeData.length > 0) {
          // Define columns we always want to exclude
          const alwaysExcludedColumns = [
            'image_storage_url', 
            'delivery_parking_instructions', 
            'key_code',
            'store_name_future',
            'prior_registration_required'
          ];
          
          // Get all available columns (except always excluded ones)
          this.allColumns = Object.keys(this.storeData[0])
            .filter(column => !alwaysExcludedColumns.includes(column));
          
          // Add new columns that might not be in the data yet
          const newColumns = [
            'manual',
            'store_company',
            'geolocation',
            'new_route_08_05',
            'route8_5_25',
            'opening_time_sunday',
            'keys_available',
            'key_code'
          ];
          
          newColumns.forEach(column => {
            if (!this.allColumns.includes(column) && !alwaysExcludedColumns.includes(column)) {
              this.allColumns.push(column);
            }
          });
          
          // Initialize columns with default values if not already set
          this.allColumns.forEach(column => {
            // Only initialize column visibility if not already set
            if (this.columnVisibility[column] === undefined) {
              this.columnVisibility[column] = true;
            }
            
            // Only set default column widths if not already stored in localStorage
            if (this.columnWidths[column] === undefined) {
              // Set default column widths based on the type or name
              if (column === 'location_link') {
                this.columnWidths[column] = 100; // Smaller width for links
              } else if (column.includes('name') || column.includes('address')) {
                this.columnWidths[column] = 200; // Wider for names and addresses
              } else {
                this.columnWidths[column] = 150; // Default width
              }
            }
          });
          
          // Set visible columns
          this.updateVisibleColumns();
        }
        
        // Populate allRoutes with unique values from old and new route columns
        const routeSet = new Set<string>();
        const segregatedSet = new Set<string>();
        
        this.storeData.forEach(row => {
          if (row['old_route']) routeSet.add(row['old_route']);
          if (row['new_route_08_05']) routeSet.add(row['new_route_08_05']);
          if (row['route8_5_25']) routeSet.add(row['route8_5_25']);
          
          // Identify segregated routes (routes that are only in mastref files marked as segregated)
          if (row['is_segregated'] === true || row['is_segregated'] === 'true' || row['is_segregated'] === 'yes') {
            if (row['old_route']) segregatedSet.add(row['old_route']);
            if (row['new_route_08_05']) segregatedSet.add(row['new_route_08_05']);
            if (row['route8_5_25']) segregatedSet.add(row['route8_5_25']);
          }
        });
        
        this.allRoutes = Array.from(routeSet).filter(r => !!r).sort();
        
        // Initialize selectedRoutes map
        this.allRoutes.forEach(route => {
          this.selectedRoutes[route] = false; // Initially all routes are unselected
        });
        
        // Initialize segregatedRoutes map
        Array.from(segregatedSet).forEach(route => {
          this.segregatedRoutes[route] = true;
        });
        
        this.updatePagedData();
      }
    } catch (error) {
      console.error('Error loading store data:', error);
    } finally {
      this.loading = false;
    }
  }
  
  updateVisibleColumns(): void {
    this.columns = this.allColumns.filter(column => this.columnVisibility[column]);
    
    // Clean up localStorage to remove any columns that no longer exist
    this.cleanupStoredColumnData();
  }
  
  // Remove data for columns that no longer exist
  cleanupStoredColumnData(): void {
    // Get list of all possible column keys from both objects
    const allStoredColumnKeys = new Set([
      ...Object.keys(this.columnWidths),
      ...Object.keys(this.columnVisibility)
    ]);
    
    // Check each key against the current allColumns list
    allStoredColumnKeys.forEach(key => {
      if (!this.allColumns.includes(key)) {
        // Remove data for columns that don't exist anymore
        if (key in this.columnWidths) {
          delete this.columnWidths[key];
        }
        if (key in this.columnVisibility) {
          delete this.columnVisibility[key];
        }
      }
    });
    
    // Save the cleaned up data
    this.saveColumnWidthsToStorage();
    this.saveColumnVisibilityToStorage();
  }
  
  toggleColumnVisibility(column: string): void {
    this.columnVisibility[column] = !this.columnVisibility[column];
    this.updateVisibleColumns();
  }
  
  toggleColumnModal(): void {
    this.showColumnModal = !this.showColumnModal;
  }
  
  applyColumnVisibility(): void {
    this.updateVisibleColumns();
    this.toggleColumnModal();
    this.saveColumnVisibilityToStorage();
  }
  
  resetColumnVisibility(): void {
    this.allColumns.forEach(column => {
      this.columnVisibility[column] = true;
    });
    this.updateVisibleColumns();
    this.saveColumnVisibilityToStorage();
  }
  
  // Edit functionality
  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (!this.editMode) {
      // Clear edited cells when exiting edit mode without saving
      this.editedCells = {};
      this.editedRows.clear();
    }
  }
  
  isEditing(rowIndex: number, column: string): boolean {
    // Always return true in edit mode - our CSS will handle showing the right controls
    return this.editMode;
  }
  
  startEdit(rowIndex: number, column: string, value: any): void {
    // In edit mode, all cells are always editable
    if (this.editMode) {
      return;
    }
  }
  
  updateEditedValue(rowIndex: number, column: string, value: any): void {
    const rowKey = this.getRowKey(rowIndex);
    const cellKey = `${rowKey}:${column}`;
    
    // Get the original cell value
    const originalValue = this.pagedData[rowIndex][column];
    
    // Only track changes if the value is actually different
    if (value !== originalValue) {
      console.log(`Cell ${cellKey} changed from "${originalValue}" to "${value}"`);
      this.editedCells[cellKey] = value;
      this.editedRows.add(rowIndex);
    } else {
      // If the value is the same as the original, remove it from edited cells
      console.log(`Cell ${cellKey} reset to original value "${originalValue}"`);
      delete this.editedCells[cellKey];
      
      // Check if this row has any other edited cells
      const hasOtherEdits = Object.keys(this.editedCells).some(key => 
        key.startsWith(`${rowKey}:`) && key !== cellKey
      );
      
      // If no other cells in this row are edited, remove the row from editedRows
      if (!hasOtherEdits) {
        this.editedRows.delete(rowIndex);
      }
    }
  }
  
  // Handle input events safely with proper type checking
  handleInputEvent(event: Event, rowIndex: number, column: string): void {
    const target = event.target as HTMLInputElement;
    
    if (this.isBooleanTextField(column)) {
      this.handleBooleanTextInput(event, rowIndex, column);
    } else {
      this.updateEditedValue(rowIndex, column, target.value);
    }
  }
  
  // Handle blur event to save when user clicks away
  handleInputBlur(event: Event, rowIndex: number, column: string): void {
    // When input loses focus, we don't need to do anything special
    // The handleInputEvent already updated the value
  }
  
  getCellValue(rowIndex: number, column: string): any {
    // First check if there's an edited value
    const rowKey = this.getRowKey(rowIndex);
    const cellKey = `${rowKey}:${column}`;
    
    if (cellKey in this.editedCells) {
      return this.editedCells[cellKey];
    }
    
    // Otherwise get the original value
    const value = this.pagedData[rowIndex][column];
    
    // Special handling for text fields that represent boolean values
    if (this.isBooleanTextField(column)) {
      return this.formatBooleanTextField(value);
    }
    
    return value !== null && value !== undefined ? value : '';
  }
  
  // Method to identify text fields that represent boolean values
  isBooleanTextField(column: string): boolean {
    const booleanTextFields = ['manual', 'keys_available', 'hour_access_24'];
    return booleanTextFields.includes(column);
  }
  
  // Format boolean text fields for display
  formatBooleanTextField(value: any): string {
    if (value === null || value === undefined) return '';
    
    // Convert the value to lowercase string for comparison
    const strValue = String(value).toLowerCase();
    
    // Check if the value indicates "true"
    if (['yes', 'y', 'true', '1'].includes(strValue)) {
      return 'Yes';
    }
    
    // Check if the value indicates "false"
    if (['no', 'n', 'false', '0'].includes(strValue)) {
      return 'No';
    }
    
    // Return the original value if it doesn't match known patterns
    return value;
  }
  
  // Method to handle input for boolean text fields
  handleBooleanTextInput(event: Event, rowIndex: number, column: string): void {
    const target = event.target as HTMLInputElement;
    let value = target.value.trim();
    
    // Convert common boolean text inputs to standard values
    if (['yes', 'y', 'true', '1'].includes(value.toLowerCase())) {
      value = 'Yes';
    } else if (['no', 'n', 'false', '0'].includes(value.toLowerCase())) {
      value = 'No';
    }
    
    // Update the cell
    this.updateEditedValue(rowIndex, column, value);
  }
  
  // Save changes implementation (manual only)
  async saveChanges(): Promise<void> {
    this.isSaving = true;
    this.saveSuccess = false;
    this.saveError = false;
    
    console.log('Starting to save changes for edited rows:', this.editedRows.size);
    
    try {
      // Collect all changes into a row-based format for the API
      const rowUpdates: {[key: string]: any} = {};
      
      // Process all edited cells
      Object.entries(this.editedCells).forEach(([cellKey, newValue]) => {
        // Parse the cell key to get row key and column
        // Format is either "dispatch_store:D4091:ARAM006:column" or "id:123:column" or "index:1:column"
        const parts = cellKey.split(':');
        let rowKey: string;
        let column: string;
        
        if (parts[0] === 'dispatch_store') {
          // Format: "dispatch_store:D4091:ARAM006:column"
          rowKey = `${parts[0]}:${parts[1]}:${parts[2]}`;
          column = parts[3];
        } else if (parts[0] === 'id' || parts[0] === 'index') {
          // Format: "id:123:column" or "index:1:column"
          rowKey = `${parts[0]}:${parts[1]}`;
          column = parts[2];
        } else {
          // Legacy format or direct key
          console.log(`Legacy cell key format: ${cellKey}, attempting direct parsing`);
          const lastColon = cellKey.lastIndexOf(':');
          rowKey = cellKey.substring(0, lastColon);
          column = cellKey.substring(lastColon + 1);
        }
        
        console.log(`Parsed cell key "${cellKey}" -> rowKey="${rowKey}", column="${column}"`);
        
        // Initialize row object if not exist
        if (!rowUpdates[rowKey]) {
          rowUpdates[rowKey] = {};
        }
        
        // Add the changed column value
        rowUpdates[rowKey][column] = newValue;
      });
      
      // Prepare the updates array for the API
      const updates: any[] = [];
      
      // Process each row update
      for (const [rowKey, changes] of Object.entries(rowUpdates)) {
        // Find the original row that corresponds to this key
        let originalRow: any = null;
        
        // Parse the row key format to find the row
        if (rowKey.startsWith('id:')) {
          const id = rowKey.substring(3);
          originalRow = this.storeData.find(row => row.store_id === parseInt(id) || row.store_id === id);
          console.log(`Looking for row with store_id=${id}`, originalRow ? 'Found' : 'Not found');
        } else if (rowKey.startsWith('index:')) {
          const index = parseInt(rowKey.substring(6));
          originalRow = this.pagedData[index];
          console.log(`Looking for row at index=${index}`, originalRow ? 'Found' : 'Not found');
        } else if (rowKey.startsWith('dispatch_store:')) {
          // Handle composite keys (dispatch_code:store_code)
          const parts = rowKey.split(':');
          const dispatchCode = parts[1];
          const storeCode = parts[2];
          originalRow = this.storeData.find(row => 
            row.dispatch_code === dispatchCode && row.store_code === storeCode
          );
          console.log(`Looking for row with dispatch_code=${dispatchCode} and store_code=${storeCode}`, originalRow ? 'Found' : 'Not found');
        } else {
          // Try to parse as a legacy format or direct key
          console.log(`Unknown key format: ${rowKey}, attempting direct lookup`);
          originalRow = this.storeData.find(row => 
            row.dispatch_code === rowKey || 
            (row.store_code && row.dispatch_code && `${row.dispatch_code}:${row.store_code}` === rowKey)
          );
        }
        
        if (!originalRow) {
          console.error(`Could not find original row for key: ${rowKey}`);
          continue; // Skip this update
        }
        
        // Create a complete update object with all needed fields
        const completeUpdate = {
          ...originalRow,  // Include all original data
          ...changes       // Override with changes
        };
        
        updates.push(completeUpdate);
      }
      
      console.log('Prepared updates for API:', updates);
      
      if (updates.length > 0) {
        // Call the service to update the store information
        const result = await this.supabaseService.updateStoreInformation(updates);
        
        if (result.success) {
          console.log('Successfully saved all changes:', result);
          this.saveSuccess = true;
          this.lastSavedTime = new Date();
          
          // Clear tracked changes
          this.editedCells = {};
          this.editedRows.clear();
          
          // Refresh data after saving
          this.loadStoreData();
        } else {
          console.error('Error saving changes:', result.error);
          this.saveError = true;
        }
      } else {
        console.log('No changes to save');
        this.saveSuccess = true;
      }
    } catch (error) {
      console.error('Exception while saving changes:', error);
      this.saveError = true;
    } finally {
      this.isSaving = false;
      
      // Auto-hide success message after 5 seconds
      if (this.saveSuccess) {
        setTimeout(() => {
          this.saveSuccess = false;
        }, 5000);
      }
    }
  }
  
  // Standardize column names for UI display
  private standardizeColumnNames(data: any[]): any[] {
    return data.map(row => this.fixColumnNames(row));
  }

  // Fix column names to match database schema
  private fixColumnNames(row: any): any {
    const fixedRow = { ...row };
    
    // Map standard column names
    const columnMapping: {[key: string]: string} = {
      'address_line': 'address_line',
      'address_line_1': 'address_line',
      'store_full_name': 'store_name',
      'new_route_15_04': 'new_route_08_05',
      'route8_5_25': 'route8_5_25',
      'dispatch': 'dispatch_code',
      'store': 'store_code',
      'name': 'store_name',
      'company': 'store_company',
      'geolocation': 'geolocation',
      'eircode': 'eircode',
      'old route': 'old_route',
      'new route': 'new_route_08_05',
      'hour_access_24': 'hour_access_24',
      'earliest_delivery': 'earliest_delivery_time',
      'opening_time_sat': 'opening_time_saturday',
      'opening_time_sun': 'opening_time_sunday',
      'openining_time_bh': 'openining_time_bankholiday',
      'door_code': 'door_code',
      'alarm': 'alarm_code',
      'fridge': 'fridge_code',
      'keys': 'keys_available',
      'key_code': 'key_code',
      'manual': 'manual'
    };
    
    // Apply mappings for any keys that need to be standardized
    Object.keys(columnMapping).forEach(displayName => {
      if (displayName in row) {
        const dbName = columnMapping[displayName];
        fixedRow[dbName] = row[displayName];
        if (displayName !== dbName) {
          delete fixedRow[displayName];
        }
      }
    });
    
    return fixedRow;
  }
  
  filterData(): void {
    // Start with all data
    let filtered = [...this.storeData];
    
    // Apply search filter if there's a search term
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(row => {
        // Search across all columns
        return Object.keys(row).some(key => {
          const value = row[key];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(term);
        });
      });
    }
    
    // Apply 24-hour filter if enabled
    if (this.show24HoursOnly) {
      filtered = filtered.filter(row => {
        return row['24_hour_access'] === true || 
               row['24_hour_access'] === 'true' || 
               row['24_hour_access'] === 'yes' || 
               row['24_hour_access'] === 'Yes' || 
               row['24_hour_access'] === 'YES';
      });
    }
    
    // Apply route filter if any routes are selected
    const selectedRouteCount = Object.values(this.selectedRoutes).filter(Boolean).length;
    if (selectedRouteCount > 0) {
      filtered = filtered.filter(row => {
        // Check if any of the route columns match selected routes
        return (
          (row['old_route'] && this.selectedRoutes[row['old_route']]) || 
          (row['new_route_08_05'] && this.selectedRoutes[row['new_route_08_05']]) ||
          (row['route8_5_25'] && this.selectedRoutes[row['route8_5_25']])
        );
      });
    }
    
    // Apply segregated routes filter if enabled
    if (this.showSegregatedRoutes) {
      filtered = filtered.filter(row => {
        const isSegregated = row['is_segregated'] === true || 
                            row['is_segregated'] === 'true' || 
                            row['is_segregated'] === 'yes';
        
        const hasSegregatedRoute = 
          (row['old_route'] && this.segregatedRoutes[row['old_route']]) || 
          (row['new_route_08_05'] && this.segregatedRoutes[row['new_route_08_05']]) ||
          (row['route8_5_25'] && this.segregatedRoutes[row['route8_5_25']]);
        
        return isSegregated || hasSegregatedRoute;
      });
    }
    
    // Update the filtered data
    this.filteredData = filtered;
    
    // Adjust items per page based on filter criteria
    const routeFiltersApplied = selectedRouteCount > 0 || this.showSegregatedRoutes;
    this.adjustItemsPerPage(filtered.length, routeFiltersApplied);
    
    // Apply sorting
    this.applySorting();
    
    // Update pagination
    this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);
    
    // Update paged data
    this.updatePagedData();
  }

  toggle24HourFilter(): void {
    // Don't toggle the model value here since the [(ngModel)] binding
    // will handle that automatically with the (click) event
    this.filterData(); // Just apply the filter
  }

  sortData(column: string): void {
    if (this.sortColumn === column) {
      // Toggle direction if clicking the same column
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // Set new column and default to ascending
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.applySorting();
    this.updatePagedData();
  }

  private applySorting(): void {
    const column = this.sortColumn;
    // Perform the sort
    this.filteredData.sort((a, b) => {
      const valueA = a[column];
      const valueB = b[column];
      
      // Handle null values
      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return this.sortDirection === 'asc' ? 1 : -1;
      if (valueB === null) return this.sortDirection === 'asc' ? -1 : 1;
      
      // Perform the comparison based on data type
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return this.sortDirection === 'asc' 
          ? valueA.localeCompare(valueB) 
          : valueB.localeCompare(valueA);
      } else {
        // For numbers and other types
        return this.sortDirection === 'asc' 
          ? (valueA > valueB ? 1 : -1) 
          : (valueA < valueB ? 1 : -1);
      }
    });
  }
  
  // Pagination methods
  updatePagedData(): void {
    this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
    
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
    
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredData.length);
    this.pagedData = this.filteredData.slice(startIndex, endIndex);
    
    // Small delay to ensure DOM updates
    setTimeout(() => {
      // Force redraw of the table
      const tableBody = document.querySelector('.table-body');
      if (tableBody) {
        tableBody.scrollTop = 0;
      }
    }, 0);
  }
  
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagedData();
    }
  }
  
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagedData();
    }
  }
  
  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagedData();
    }
  }
  
  // Get page numbers to display in pagination controls
  get pageNumbers(): number[] {
    const visiblePages = 5; // Number of page buttons to show
    const pages: number[] = [];
    
    let startPage = Math.max(1, this.currentPage - Math.floor(visiblePages / 2));
    let endPage = Math.min(this.totalPages, startPage + visiblePages - 1);
    
    // Adjust if we're near the end
    if (endPage - startPage + 1 < visiblePages && startPage > 1) {
      startPage = Math.max(1, endPage - visiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }
  
  // Helper to format column name for display
  formatColumnName(column: string): string {
    // Handle special cases first
    const specialCases: Record<string, string> = {
      'store_id': 'Store ID',
      'image_storage_url': 'Image URL',
      'manual': 'Manual',
      'dispatch_code': 'Dispatch Code',
      'store_code': 'Store Code',
      'store_company': 'Store Company',
      'store_name': 'Store Name',
      'address_line': 'Address',
      'geolocation': 'Geolocation',
      'eircode': 'Eircode',
      'old_route': 'Old Route',
      'new_route_08_05': 'New Route (08/05)',
      'route8_5_25': 'Route (8.5.25)',
      'location_link': 'Location Link',
      'door_code': 'Door Code',
      'alarm_code': 'Alarm Code',
      'fridge_code': 'Fridge Code',
      'keys_available': 'Keys Available',
      'key_code': 'Key Code',
      'hour_access_24': '24 Hour Access',
      'earliest_delivery_time': 'Earliest Delivery Time',
      'opening_time_saturday': 'Opening Time (Saturday)',
      'opening_time_sunday': 'Opening Time (Sunday)',
      'openining_time_bankholiday': 'Opening Time (Bank Holiday)'
    };
    
    // Return special case if it exists
    if (column in specialCases) {
      return specialCases[column];
    }
    
    // Otherwise, apply standard formatting (capitalize first letter of each word, replace underscores with spaces)
    return column
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Toggle route filter dropdown visibility
  toggleRouteFilterDropdown(): void {
    this.showRouteFilter = !this.showRouteFilter;
  }
  
  // Get the count of selected routes for the badge
  getSelectedRoutesCount(): number {
    return Object.values(this.selectedRoutes).filter(selected => selected).length;
  }
  
  // Clear all route selections
  clearRouteSelection(): void {
    Object.keys(this.selectedRoutes).forEach(route => {
      this.selectedRoutes[route] = false;
    });
    this.filterData();
  }
  
  // Toggle a specific route selection state
  toggleRouteSelection(route: string): void {
    this.selectedRoutes[route] = !this.selectedRoutes[route];
    this.filterData();
  }
  
  // Check if any route is selected
  get hasSelectedRoutes(): boolean {
    return Object.values(this.selectedRoutes).some(selected => selected);
  }

  // Close the route filter dropdown when clicking outside of it
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Skip if the dropdown is not open
    if (!this.showRouteFilter) return;
    
    // Check if the click was outside of the dropdown
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.showRouteFilter = false;
    }
  }

  // Add a new method to adjust items per page
  adjustItemsPerPage(filteredCount: number, routeFiltersApplied: boolean): void {
    const defaultItemsPerPage = 40; // Original default value
    
    if (routeFiltersApplied) {
      // If routes are filtered, increase the page size based on number of results
      if (filteredCount <= 100) {
        // If 100 or fewer results, show all of them
        this.itemsPerPage = filteredCount || defaultItemsPerPage;
      } else if (filteredCount <= 200) {
        // If between 100-200 results, show 100 per page
        this.itemsPerPage = 100;
      } else {
        // If more than 200 results, show 200 per page
        this.itemsPerPage = 200;
      }
    } else {
      // Reset to default when no route filters are applied
      this.itemsPerPage = defaultItemsPerPage;
    }
    
    // Ensure we always have at least one page
    if (this.itemsPerPage <= 0) {
      this.itemsPerPage = defaultItemsPerPage;
    }
  }

  // Get a unique key for a row to use with edited cells tracking
  getRowKey(rowIndex: number): string {
    const row = this.pagedData[rowIndex];
    
    // Try to use a stable identifier if available
    if (row.store_id) {
      return `id:${row.store_id}`;
    }
    
    // Otherwise use a composite key
    if (row.store_code && row.dispatch_code) {
      return `dispatch_store:${row.dispatch_code}:${row.store_code}`;
    }
    
    // Fallback to rowIndex if no stable identifiers are available
    return `index:${rowIndex}`;
  }

  // Toggle segregated routes filter
  toggleSegregatedRoutesFilter(): void {
    this.showSegregatedRoutes = !this.showSegregatedRoutes;
    this.filterData();
  }
  
  // Check if a route is segregated
  isSegregatedRoute(route: string): boolean {
    return !!this.segregatedRoutes[route];
  }
  
  // Check if a row belongs to a segregated route
  isSegregatedRow(row: any): boolean {
    // Check if the row itself is marked as segregated
    if (row['is_segregated'] === true || row['is_segregated'] === 'true' || row['is_segregated'] === 'yes') {
      return true;
    }
    
    // Check if any of the route columns match a segregated route
    return (
      (row['old_route'] && this.segregatedRoutes[row['old_route']]) || 
      (row['new_route_08_05'] && this.segregatedRoutes[row['new_route_08_05']]) ||
      (row['route8_5_25'] && this.segregatedRoutes[row['route8_5_25']])
    );
  }
} 