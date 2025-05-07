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
        this.storeData.forEach(row => {
          if (row['old_route']) routeSet.add(row['old_route']);
          if (row['new_route']) routeSet.add(row['new_route']);
        });
        this.allRoutes = Array.from(routeSet).filter(r => !!r).sort();
        
        // Initialize selectedRoutes map
        this.allRoutes.forEach(route => {
          this.selectedRoutes[route] = false; // Initially all routes are unselected
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
    const cellKey = `${rowIndex}_${column}`;
    return cellKey in this.editedCells;
  }
  
  startEdit(rowIndex: number, column: string, value: any): void {
    // Always allow editing regardless of editMode
    const cellKey = `${rowIndex}_${column}`;
    this.editedCells[cellKey] = value;
  }
  
  updateEditedValue(rowIndex: number, column: string, value: any): void {
    const cellKey = `${rowIndex}_${column}`;
    const row = this.pagedData[rowIndex];
    
    // Only mark as edited if the value actually changed
    if (row[column] !== value) {
      this.editedCells[cellKey] = value;
      
      // Mark this row as edited
      this.editedRows.add(rowIndex);
    }
  }
  
  // Handle input events safely with proper type checking
  handleInputEvent(event: Event, rowIndex: number, column: string): void {
    const target = event.target as HTMLInputElement;
    if (target && target.value !== undefined) {
      // Just store the value but don't trigger save
      const cellKey = `${rowIndex}_${column}`;
      this.editedCells[cellKey] = target.value;
    }
  }
  
  // Handle blur event to save when user clicks away
  handleInputBlur(event: Event, rowIndex: number, column: string): void {
    const target = event.target as HTMLInputElement;
    if (target && target.value !== undefined) {
      this.updateEditedValue(rowIndex, column, target.value);
    }
  }
  
  getCellValue(rowIndex: number, column: string): any {
    const cellKey = `${rowIndex}_${column}`;
    const row = this.pagedData[rowIndex];
    
    // If cell is being edited, return the edited value
    if (cellKey in this.editedCells) {
      return this.editedCells[cellKey];
    }
    
    // Otherwise return the original value
    return row[column];
  }
  
  // Save changes implementation (manual only)
  async saveChanges(): Promise<void> {
    if (this.editedRows.size === 0 || this.isSaving) {
      return;
    }
    
    this.isSaving = true;
    this.saveSuccess = false;
    this.saveError = false;
    
    try {
      // Prepare the updates by gathering all edited rows
      const updates: any[] = [];
      
      // List of text fields based on the schema
      const textFields = [
        'door_code', 'alarm_code', 'fridge_code', 'manual', 'dispatch_code', 
        'store_name', 'store_code', 'store_full_name', 'store_name_future',
        'address_line_1', 'old_route', 'new_route_15_04', 'date_21_04',
        'eircode', 'location_link', 'keys_available', 'hour_access_24',
        'mon', 'tue', 'wed', 'thur', 'fri', 'sat', 'earliest_delivery_time',
        'opening_time_saturday', 'openining_time_bankholiday', 'delivery_parking_instructions'
      ];
      
      this.editedRows.forEach(rowIndex => {
        const originalRow = this.pagedData[rowIndex];
        if (originalRow) { // Make sure the row exists
          const updatedRow = { ...originalRow };
          let hasChanges = false;
          
          // Apply all edits for this row
          Object.keys(this.editedCells).forEach(cellKey => {
            const [cellRowIndex, column] = cellKey.split('_');
            
            if (parseInt(cellRowIndex) === rowIndex) {
              // Only update if the value actually changed
              if (updatedRow[column] !== this.editedCells[cellKey]) {
                // Ensure all text fields are stored as strings
                if (textFields.includes(column)) {
                  // Convert to string, but handle null/undefined properly
                  updatedRow[column] = this.editedCells[cellKey] != null 
                    ? String(this.editedCells[cellKey])
                    : null;
                  console.log(`Setting ${column} to: ${updatedRow[column]}`);
                } else {
                  updatedRow[column] = this.editedCells[cellKey];
                }
                hasChanges = true;
              }
            }
          });
          
          // Only add to updates if actual changes were made
          if (hasChanges) {
            // Log the row before applying column name fixes
            console.log('Row before fixing column names:', JSON.stringify(updatedRow));
            
            // Fix column names to match database schema
            const fixedRow = this.fixColumnNames(updatedRow);
            console.log('Row after fixing column names:', JSON.stringify(fixedRow));
            
            // Ensure we have identifiers for the update
            if (fixedRow.id || 
                (fixedRow.dispatch_code && fixedRow.store_code) || 
                fixedRow.store_name) {
              updates.push(fixedRow);
            } else {
              console.error('Cannot update row without proper identifiers:', fixedRow);
            }
          }
        }
      });
      
      // Only proceed with the update if we have changes to save
      if (updates.length > 0) {
        console.log('Sending updates to Supabase:', JSON.stringify(updates));
        
        // Send updates to Supabase
        const result = await this.supabaseService.updateStoreInformation(updates);
        
        if (result.success) {
          this.saveSuccess = true;
          this.lastSavedTime = new Date();
          
          // Clear the edited cells and rows after successful save
          this.editedCells = {};
          this.editedRows.clear();
          
          // Reload the store data to ensure we have the latest data
          this.loadStoreData();
        } else {
          this.saveError = true;
          console.error('Error saving changes:', result.error);
          // Display more detailed error information in the console
          if (result.results) {
            result.results.forEach((res: any, index: number) => {
              if (!res.success) {
                console.error(`Error on update #${index}:`, res.error);
                console.error('Failed update payload:', updates[index]);
              }
            });
          }
        }
      } else {
        // No actual changes to save
        this.editedCells = {};
        this.editedRows.clear();
      }
    } catch (error) {
      this.saveError = true;
      console.error('Exception during save:', error);
    } finally {
      this.isSaving = false;
      
      // Clear success/error status after a delay
      setTimeout(() => {
        this.saveSuccess = false;
        this.saveError = false;
      }, 3000);
    }
  }
  
  // Standardize column names for UI display
  private standardizeColumnNames(data: any[]): any[] {
    if (!data || data.length === 0) return data;
    
    return data.map(row => {
      const standardizedRow = { ...row };
      
      // Map of database column names to frontend column names
      const columnMapping: {[key: string]: string} = {
        'address_line_1': 'address',
        'store_full_name': 'store_name_1',
        'new_route_15_04': 'new_route',
        'date_21_04': 'date',
        'door_code': 'door' // Ensure door_code from DB maps to door in the UI
      };
      
      // Replace database column names with frontend names
      Object.keys(columnMapping).forEach(dbName => {
        if (dbName in standardizedRow) {
          const frontendName = columnMapping[dbName];
          standardizedRow[frontendName] = standardizedRow[dbName];
          // Keep the original for database operations
        }
      });
      
      return standardizedRow;
    });
  }

  // Fix column names to match database schema
  private fixColumnNames(row: any): any {
    const fixedRow = { ...row };
    
    // Map of frontend column names to database column names
    const columnMapping: {[key: string]: string} = {
      'address': 'address_line_1',
      'store_name_1': 'store_full_name',
      'new_route': 'new_route_15_04',
      'date': 'date_21_04',
      'door': 'door_code' // Fix the incorrect mapping - 'door' should map to 'door_code'
      // Add any other mismatched column names here
    };
    
    // Replace any mismatched column names
    Object.keys(columnMapping).forEach(frontendName => {
      if (frontendName in fixedRow) {
        const dbName = columnMapping[frontendName];
        fixedRow[dbName] = fixedRow[frontendName];
        delete fixedRow[frontendName];
      }
    });
    
    return fixedRow;
  }
  
  filterData(): void {
    let data = [...this.storeData];
    
    // Filter by selected routes - only if at least one route is selected
    const routeFiltersApplied = this.hasSelectedRoutes;
    if (routeFiltersApplied) {
      data = data.filter(row => {
        // If old_route or new_route is in the selected routes, keep the row
        return (row['old_route'] && this.selectedRoutes[row['old_route']]) || 
               (row['new_route'] && this.selectedRoutes[row['new_route']]);
      });
    }
    
    // Apply search term filter
    if (this.searchTerm.trim()) {
      const searchTermLower = this.searchTerm.toLowerCase();
      data = data.filter(item => {
        return Object.keys(item).some(key => {
          const value = item[key];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchTermLower);
        });
      });
    }
    
    // Apply 24-hour filter
    if (this.show24HoursOnly) {
      data = data.filter(item => {
        // Filter for stores that have "Yes", "Y", "True", "1", etc. in hour_access_24 column
        const access24Value = String(item.hour_access_24 || '').toLowerCase();
        return ['yes', 'y', 'true', '1'].includes(access24Value);
      });
    }
    
    this.filteredData = data;
    
    // Adjust items per page based on filter results
    this.adjustItemsPerPage(data.length, routeFiltersApplied);
    
    // If we were sorting before, maintain the sort on the filtered data
    if (this.sortColumn) {
      this.applySorting();
    }
    
    // Reset to first page when filtering
    this.currentPage = 1;
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
    return column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
} 