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
    
    // Set up scroll synchronization after component initialization
    setTimeout(() => this.setupScrollSync(), 500);
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
        this.storeData = this.standardizeColumnNames(data);
        this.totalStoreCount = this.supabaseService.getTotalStoreCount() || data.length;
        this.filteredData = [...this.storeData];
        
        if (this.storeData.length > 0) {
          const alwaysExcludedColumns = [
            'store_images',         // Raw data, use 'image_url' or 'image_data' for display
            'store_additional_info',// Raw data, use 'notes' for display
            'updated_at',
            'created_at',
            'id',                   // Typically not shown directly in the table UI but used as a key
            // Fields that are mapped to others and should not be duplicated:
            'address_line',         // Mapped to 'address'
            'keys_available',       // Mapped to 'keys'
            // The following are examples if you have specific UI versions like 'opening_time_sun' vs 'opening_time_sunday'
            // 'opening_time_sunday', // if UI uses 'opening_time_sun'
            // 'opening_time_saturday', // if UI uses 'opening_time_sat'
          ];

          this.allColumns = Object.keys(this.storeData[0])
            .filter(column => !alwaysExcludedColumns.includes(column));
          
          // Add derived/virtual columns if they are not directly in storeData[0]
          if (!this.allColumns.includes('image_url') && this.storeData[0].store_images) {
            this.allColumns.push('image_url');
          }
          if (!this.allColumns.includes('notes') && this.storeData[0].store_additional_info) {
            this.allColumns.push('notes');
          }
          if (!this.allColumns.includes('delivery_days')) {
            this.allColumns.push('delivery_days');
          }
          
          // Columns expected based on the 'stores' table schema and derived fields
          // Ensure these are consistent with what `standardizeColumnNames` produces for the UI
          const expectedUIColumns = [
            'manual',
            'image_url', // Derived from store_images
            'notes',     // Derived from store_additional_info
            'dispatch_code',
            'dispatch_store_name',
            'site_id',
            'store_code',
            'store_company',
            'store_name',
            'address',   // Mapped from address_line
            'city',
            'county',
            'eircode',
            'latitude',
            'longitude',
            'route',
            'alarm_code',
            'fridge_code',
            'keys',      // Mapped from keys_available
            'key_code',
            'prior_registration_required',
            'hour_access_24',
            'opening_time_bankholiday',
            'opening_time_weekdays',
            'opening_time_sat',
            'opening_time_sun',
            'email',
            'phone',
            'delivery_days', // Virtual column for UI
            // Individual delivery days for toggling, matching DB fields prefixed with 'deliver_'
            'deliver_monday',
            'deliver_tuesday',
            'deliver_wednesday',
            'deliver_thursday',
            'deliver_friday',
            'deliver_saturday',
          ];

          // Add any missing expected columns to allColumns
          expectedUIColumns.forEach(column => {
            if (!this.allColumns.includes(column)) {
              this.allColumns.push(column);
            }
          });
          
          // Filter allColumns again to remove any that might have been added but are not in expectedUIColumns, 
          // unless they were part of the original data and not in alwaysExcluded.
          // This ensures we only deal with columns we intend to display or manage.
          const initialColumnsFromData = Object.keys(this.storeData[0]).filter(c => !alwaysExcludedColumns.includes(c));
          const columnsToKeep = new Set([...initialColumnsFromData, ...expectedUIColumns]);
          this.allColumns = this.allColumns.filter(column => columnsToKeep.has(column));

          this.allColumns.forEach(column => {
            if (this.columnVisibility[column] === undefined) {
              if (column.startsWith('deliver_') && column !== 'delivery_days') {
                this.columnVisibility[column] = false;
              } else {
                this.columnVisibility[column] = true;
              }
            }
            if (this.columnWidths[column] === undefined) {
              if (column === 'image_url') this.columnWidths[column] = 100;
              else if (column === 'delivery_days') this.columnWidths[column] = 250;
              else if (column === 'notes') this.columnWidths[column] = 300;
              else if (column.includes('name') || column.includes('address')) this.columnWidths[column] = 200;
              else this.columnWidths[column] = 150;
            }
          });

          this.updateVisibleColumns();
        }
        
        const routeSet = new Set<string>();
        const segregatedSet = new Set<string>();
        this.storeData.forEach(row => {
          if (row['route']) routeSet.add(row['route']);
          if (row['is_segregated'] === true || String(row['is_segregated']).toLowerCase() === 'true' || String(row['is_segregated']).toLowerCase() === 'yes') {
            if (row['route']) segregatedSet.add(row['route']);
          }
        });
        this.allRoutes = Array.from(routeSet).filter(r => !!r).sort();
        this.allRoutes.forEach(route => { this.selectedRoutes[route] = false; });
        Array.from(segregatedSet).forEach(route => { this.segregatedRoutes[route] = true; });
        
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
    // Get the filtered list of columns for the modal
    const visibleColumnsForModal = this.getVisibleColumnsForModal();
    
    // Reset visibility only for the columns that should be visible in the modal
    visibleColumnsForModal.forEach(column => {
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
    if (this.editedRows.size === 0) {
      console.log('No changes to save');
      return;
    }

    this.isSaving = true;
    this.saveSuccess = false;
    this.saveError = false;

    try {
      console.log(`Preparing to save changes for ${this.editedRows.size} rows`);
      
      // Collect all updates into an array
      const updates: any[] = [];
      
      this.editedRows.forEach(rowIndex => {
        const rowKey = this.getRowKey(rowIndex);
        const originalRow = this.pagedData[rowIndex];
        
        // Create a shallow copy of the original row to apply edits to
        const updatedRow = { ...originalRow };
        
        // Apply all edited cell values for this row
        Object.keys(this.editedCells).forEach(cellKey => {
          if (cellKey.startsWith(`${rowKey}:`)) {
            const column = cellKey.split(':').pop() as string;
            updatedRow[column] = this.editedCells[cellKey];
          }
        });
        
        // Only add to updates if something actually changed
        if (JSON.stringify(updatedRow) !== JSON.stringify(originalRow)) {
          updates.push(updatedRow);
        }
      });
      
      console.log(`Sending ${updates.length} updates to server:`, updates);
      
      // Call the service to update the data
      const results = await this.supabaseService.updateStoreInformation(updates);
      
      // Check results for any failures
      const anyFailures = results.some(result => !result.success);
      
      if (anyFailures) {
        console.error('Some updates failed:', results.filter(r => !r.success));
        this.saveError = true;
      } else {
        console.log('All updates succeeded');
        this.saveSuccess = true;
        
        // Clear edited cells and rows after successful save
        this.editedCells = {};
        this.editedRows.clear();
        
        // Update the data after saving
        await this.loadStoreData();
      }
      
      this.lastSavedTime = new Date();
    } catch (error) {
      console.error('Error saving changes:', error);
      this.saveError = true;
    } finally {
      this.isSaving = false;
      
      // Auto-hide the success message after 5 seconds
      if (this.saveSuccess) {
        setTimeout(() => {
          this.saveSuccess = false;
        }, 5000);
      }
    }
  }
  
  // Standardize column names for UI display
  private standardizeColumnNames(data: any[]): any[] {
    return data.map(item => this.fixColumnNames(item));
  }
  
  private fixColumnNames(row: any): any {
    const standardizedRow = { ...row };

    // Map database column names to more display-friendly names
    const columnMapping: { [key: string]: string } = {
      // Direct mappings from the database to display names
      'address_line': 'address',
      'keys_available': 'keys',
      'opening_time_sunday': 'opening_time_sun',
      'opening_time_saturday': 'opening_time_sat',
      
      // Handle nested data from joined tables
      'store_additional_info': 'additional_info',
      'store_images': 'image_data'
    };

    // Apply the mappings
    Object.keys(columnMapping).forEach(dbName => {
      if (dbName in standardizedRow) {
        const displayName = columnMapping[dbName];
        standardizedRow[displayName] = standardizedRow[dbName];
        
        // Keep the original data for reference
        if (!dbName.includes('store_')) {  // Don't delete the joined table data
          delete standardizedRow[dbName];
        }
      }
    });
    
    // Handle images - extract URL from the first storefront image if available
    if (standardizedRow.store_images && Array.isArray(standardizedRow.store_images)) {
      // Find the first storefront image
      const storefrontImage = standardizedRow.store_images.find((img: any) => img.is_storefront === 'true');
      if (storefrontImage) {
        standardizedRow.image_url = storefrontImage.url;
      } else if (standardizedRow.store_images.length > 0) {
        // If no storefront image, use the first image
        standardizedRow.image_url = standardizedRow.store_images[0].url;
      }
    }
    
    // Handle additional info - extract content if available
    if (standardizedRow.store_additional_info && Array.isArray(standardizedRow.store_additional_info) 
        && standardizedRow.store_additional_info.length > 0) {
      standardizedRow.notes = standardizedRow.store_additional_info[0].content;
    }

    // Format Boolean text field values for better display
    const booleanTextFields = [
      'keys', 'prior_registration_required', 'hour_access_24'
    ];

    // Standardize Boolean text field values
    booleanTextFields.forEach(field => {
      if (field in standardizedRow) {
        const value = standardizedRow[field];
        if (value !== null && value !== undefined) {
          const lowerValue = value.toString().toLowerCase();
          if (['true', 'yes', 'y', '1'].includes(lowerValue)) {
            standardizedRow[field] = 'Yes';
          } else if (['false', 'no', 'n', '0'].includes(lowerValue)) {
            standardizedRow[field] = 'No';
          }
          // Keep other values as is
        }
      }
    });
    
    return standardizedRow;
  }
  
  filterData(): void {
    // If search term is empty and no other filters are applied, just use all data
    if (
      !this.searchTerm && 
      !this.show24HoursOnly && 
      !this.showSegregatedRoutes && 
      !this.hasSelectedRoutes
    ) {
      this.filteredData = [...this.storeData];
      this.applySorting();
      this.updatePagedData();
      return;
    }
    
    // Apply filters based on search term and other criteria
    this.filteredData = this.storeData.filter(row => {
      // Text search
      if (this.searchTerm) {
        const searchTermLower = this.searchTerm.toLowerCase();
        // Search across all text fields
        const matchesSearch = Object.keys(row).some(key => {
          const value = row[key];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchTermLower);
        });
        
        if (!matchesSearch) return false;
      }
      
      // 24-hour access filter
      if (this.show24HoursOnly) {
        const access24hr = row['hour_access_24'];
        if (!access24hr || 
            (typeof access24hr === 'string' && 
            ['no', 'n', 'false', '0', ''].includes(access24hr.toLowerCase()))) {
          return false;
        }
      }
      
      // Route filter
      if (this.hasSelectedRoutes) {
        const routeFound = row['route'] && this.selectedRoutes[row['route']];
        if (!routeFound) return false;
      }
      
      // Segregated routes filter
      if (this.showSegregatedRoutes) {
        const route = row['route'];
        if (!route || !this.segregatedRoutes[route]) return false;
      }
      
      return true;
    });
    
    // Apply sorting
    this.applySorting();
    
    // Adjust items per page for filtered results
    this.adjustItemsPerPage(this.filteredData.length, this.hasSelectedRoutes);
    
    // Update paged data
    this.updatePagedData();
  }

  toggle24HourFilter(): void {
    this.show24HoursOnly = !this.show24HoursOnly;
    this.filterData();
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
      const headerRow = document.querySelector('.header-row');
      
      if (tableBody) {
        tableBody.scrollTop = 0;
        tableBody.scrollLeft = 0; // Reset horizontal scroll
      }
      
      if (headerRow) {
        headerRow.scrollLeft = 0; // Reset header scroll position
      }
      
      // Refresh scroll sync
      this.setupScrollSync();
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
    const specialCases: { [key: string]: string } = {
      'id': 'ID',
      'manual': 'Manual',
      // 'images': 'Images', // Prefer 'image_url' or 'image_data' for UI clarity
      'dispatch_code': 'Dispatch Code',
      'dispatch_store_name': 'Dispatch Store Name',
      'site_id': 'Site ID',
      'store_code': 'Store Code',
      'store_company': 'Store Company',
      'store_name': 'Store Name',
      'address': 'Address',         // Mapped from address_line
      'city': 'City',
      'county': 'County',
      'eircode': 'Eircode',
      'latitude': 'Latitude',
      'longitude': 'Longitude',
      'route': 'Route',
      'alarm_code': 'Alarm Code',
      'fridge_code': 'Fridge Code',
      'keys': 'Keys Available',    // Mapped from keys_available
      'key_code': 'Key Code',
      'prior_registration_required': 'Prior Registration Required',
      'hour_access_24': '24-Hour Access',
      'opening_time_bankholiday': 'Bank Holiday Opening',
      'opening_time_weekdays': 'Weekday Opening',
      'opening_time_sat': 'Saturday Opening',
      'opening_time_sun': 'Sunday Opening',
      'email': 'Email',
      'phone': 'Phone',
      'image_url': 'Image Preview', // Derived
      'notes': 'Notes',           // Derived
      'additional_info': 'Additional Info', // Original field before mapping to notes
      'image_data': 'Image Data',       // Original field before mapping to image_url
      'delivery_days': 'Delivery Days', 
      'deliver_monday': 'Mon Delivery',
      'deliver_tuesday': 'Tue Delivery',
      'deliver_wednesday': 'Wed Delivery',
      'deliver_thursday': 'Thu Delivery',
      'deliver_friday': 'Fri Delivery',
      'deliver_saturday': 'Sat Delivery'
    };
    
    if (column in specialCases) {
      return specialCases[column];
    }
    
    // Generic formatting for other columns
    const formattedName = column
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formattedName;
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

  // Get a unique key for each row based on available identifiers
  getRowKey(rowIndex: number): string {
    const data = this.pagedData[rowIndex];
    if (!data) {
      return `unknown-${rowIndex}`;
    }

    // Try to get a unique identifier for the row
    // Primary key: id (UUID)
    if (data.id) {
      return `id-${data.id}`;
    }
    
    // Fallback 1: dispatch_code + store_code
    if (data.dispatch_code && data.store_code) {
      return `dc-${data.dispatch_code}-sc-${data.store_code}`;
    }
    
    // Fallback 2: store_name
    if (data.store_name) {
      return `name-${data.store_name.replaceAll(' ', '-')}`;
    }
    
    // Last resort: row index (not reliable if data changes)
    return `row-${rowIndex}`;
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
      (row['route'] && this.segregatedRoutes[row['route']])
    );
  }

  // Get filtered columns for the modal (excluding the ones we don't want to show)
  getVisibleColumnsForModal(): string[] {
    // Columns from the 'stores' table schema that should be configurable in the modal
    const storeTableColumns = [
      'manual',
      'images', // This will likely be represented as 'image_url' or 'image_data' in the UI
      'dispatch_code',
      'dispatch_store_name',
      'site_id',
      'store_code',
      'store_company',
      'store_name',
      'address', // Mapped from address_line
      'city',
      'county',
      'eircode',
      'latitude',
      'longitude',
      'route',
      'alarm_code',
      'fridge_code',
      'keys', // Mapped from keys_available
      'key_code',
      'prior_registration_required',
      'hour_access_24',
      'opening_time_bankholiday',
      'opening_time_weekdays',
      'opening_time_sat',
      'opening_time_sun',
      'email',
      'phone',
      'notes', // From store_additional_info
      'delivery_days', // Virtual column
      // Individual delivery day columns, if they are still part of allColumns
      // and the user wants to toggle them individually.
      // The current setup hides these by default if 'delivery_days' is present.
      'deliver_monday',
      'deliver_tuesday',
      'deliver_wednesday',
      'deliver_thursday',
      'deliver_friday',
      'deliver_saturday'
    ];
    
    // Filter allColumns to only include those intended for the modal
    return this.allColumns.filter(column => storeTableColumns.includes(column));
  }

  // Setup scroll synchronization between header and body
  setupScrollSync(): void {
    const tableBody = document.querySelector('.table-body');
    const headerRow = document.querySelector('.header-row');
    
    if (tableBody && headerRow) {
      // Sync header with table body scroll
      tableBody.addEventListener('scroll', () => {
        headerRow.scrollLeft = tableBody.scrollLeft;
      });
      
      console.log('Scroll synchronization set up between header and table body');
    }
  }

  // Toggle delivery day value
  toggleDeliveryDay(rowIndex: number, day: string): void {
    // Get the column name for this day
    const column = `delivery_${day.toLowerCase()}`;
    
    // Get the current value - default to 'No' if not set
    const currentValue = this.getCellValue(rowIndex, column) || 'No';
    
    // Toggle the value
    const newValue = currentValue === 'Yes' ? 'No' : 'Yes';
    
    // Update the value
    this.updateEditedValue(rowIndex, column, newValue);
  }
  
  // Check if a delivery day is active (returns true if 'Yes')
  isDeliveryDayActive(rowIndex: number, day: string): boolean {
    const column = `delivery_${day.toLowerCase()}`;
    return this.getCellValue(rowIndex, column) === 'Yes';
  }
  
  // Convert day initial to lowercase day name
  getDayName(initial: string): string {
    const dayMap: {[key: string]: string} = {
      'm': 'monday',
      't': 'tuesday',
      'w': 'wednesday',
      'th': 'thursday',
      'f': 'friday',
      's': 'saturday'
    };
    return dayMap[initial.toLowerCase()] || initial.toLowerCase();
  }
} 