import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ViewEncapsulation, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { ExcelImportService, ParsedRouteData } from '../../services/excel-import.service';
import { StoreImportService } from '../../services/store-import.service';
import { MatChipsModule } from '@angular/material/chips';
import { OverlayContainer } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';

interface RouteGroup {
  routeName: string;
  storeCount: number;
  stores: {
    storeName: string;
    totalQuantity: number;
    cratesNeeded: number;
  }[];
}

interface ImportedStore {
  id: number;
  route_name: string;
  store_name: string;
  total_quantity: number;
  crates_needed: number;
  import_date: string;
  import_batch_id: number;
}

// Interface for grouped imported stores
interface GroupedImportedRoute {
  routeName: string;
  stores: ImportedStore[];
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Confirm Data Import</h2>
    <mat-dialog-content>
      <p>
        <strong>Warning:</strong> Saving this data will delete all previous records in the database table and reset IDs to start from 1.
      </p>
      <p>
        Are you sure you want to proceed?
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="warn" [mat-dialog-close]="true">Yes, Delete Previous Data</button>
    </mat-dialog-actions>
  `
})
export class ConfirmDialogComponent {
  constructor(public dialogRef: MatDialogRef<ConfirmDialogComponent>) {}
}

@Component({
  selector: 'app-excel-import',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatExpansionModule,
    MatBadgeModule,
    MatDialogModule,
    MatChipsModule,
    MatFormFieldModule,
    MatSelectModule,
    FormsModule
  ],
  templateUrl: './excel-import.component.html',
  encapsulation: ViewEncapsulation.None, // Allow global style overrides
  styleUrls: ['./excel-import.component.scss']
})
export class ExcelImportComponent implements OnInit, OnDestroy, AfterViewInit {
  loading = false;
  parsedData: ParsedRouteData[] = [];
  flattenedData: { routeName: string, storeName: string, totalQuantity: number, cratesNeeded: number }[] = [];
  fileName = '';
  showInstructions = true;
  
  // Grouped data for the accordion
  routeGroups: RouteGroup[] = [];
  totalRecords = 0;
  
  // Route dropdown related properties
  selectedRoute: string = '';
  selectedRouteStores: { storeName: string, totalQuantity: number, cratesNeeded: number }[] = [];
  
  // Update to use imported stores instead of matched stores
  importedStores: ImportedStore[] = [];
  displayImportedStores = false;
  
  // Property for grouped imported stores
  groupedImportedStores: GroupedImportedRoute[] = [];
  
  displayedColumns: string[] = ['storeName', 'totalQuantity', 'cratesNeeded'];
  importedColumns: string[] = ['route_name', 'store_name', 'total_quantity', 'crates_needed'];
  storeColumns: string[] = ['store_name', 'total_quantity', 'crates_needed'];
  
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  private subscriptions: Subscription[] = [];
  
  constructor(
    private excelImportService: ExcelImportService,
    private storeImportService: StoreImportService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private overlayContainer: OverlayContainer
  ) { }
  
  ngOnInit(): void {
    // Subscribe to loading state
    this.subscriptions.push(
      this.excelImportService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
    
    // Also subscribe to the store import service loading state
    this.subscriptions.push(
      this.storeImportService.loading$.subscribe(loading => {
        if (this.loading !== loading) {
          this.loading = loading;
        }
      })
    );
    
    // Subscribe to messages
    this.subscriptions.push(
      this.excelImportService.message$.subscribe(message => {
        if (message) {
          this.snackBar.open(message.text, 'Close', {
            duration: 5000,
            panelClass: message.type === 'error' ? 'error-snackbar' : 'success-snackbar'
          });
        }
      })
    );
    
    // Also subscribe to store import service messages
    this.subscriptions.push(
      this.storeImportService.message$.subscribe(message => {
        if (message) {
          this.snackBar.open(message.text, 'Close', {
            duration: 5000,
            panelClass: message.type === 'error' ? 'error-snackbar' : 'success-snackbar'
          });
        }
      })
    );
    
    // Subscribe to parsed data
    this.subscriptions.push(
      this.excelImportService.parsedData$.subscribe(data => {
        this.parsedData = data;
        this.processData();
      })
    );
    
    // Subscribe to imported stores data
    this.subscriptions.push(
      this.storeImportService.importedStores$.subscribe(data => {
        this.importedStores = data;
        this.displayImportedStores = data && data.length > 0;
        if (data && data.length > 0) {
          this.groupImportedStoresByRoute();
        }
      })
    );
  }
  
  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  ngAfterViewInit() {
    // Apply classes to overlay container to help with styling
    this.overlayContainer.getContainerElement().classList.add('excel-import-overlay-container');
  }
  
  /**
   * Handle file input change event
   * @param event File input change event
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    
    if (!input.files || input.files.length === 0) {
      return;
    }
    
    const file = input.files[0];
    this.fileName = file.name;
    
    // Check if file is an Excel file
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      this.snackBar.open('Please select a valid Excel file (.xlsx or .xls)', 'Close', {
        duration: 5000,
        panelClass: 'error-snackbar'
      });
      return;
    }
    
    // Hide instructions after selecting a file
    this.showInstructions = false;
    
    // Parse the Excel file
    await this.excelImportService.parseExcelFile(file);
  }
  
  /**
   * Process parsed data into route groups for the accordion
   */
  private processData(): void {
    this.flattenData();
    
    // Create route groups for the accordion
    this.routeGroups = [];
    this.totalRecords = 0;
    
    // Group by route
    const routeMap = new Map<string, {
      storeName: string, 
      totalQuantity: number,
      cratesNeeded: number
    }[]>();
    
    this.parsedData.forEach(route => {
      if (!routeMap.has(route.routeName)) {
        routeMap.set(route.routeName, []);
      }
      
      route.stores.forEach(store => {
        routeMap.get(route.routeName)?.push({
          storeName: store.storeName,
          totalQuantity: store.totalQuantity,
          cratesNeeded: store.cratesNeeded
        });
        
        this.totalRecords++;
      });
    });
    
    // Convert map to array of route groups
    routeMap.forEach((stores, routeName) => {
      this.routeGroups.push({
        routeName,
        storeCount: stores.length,
        stores
      });
    });
    
    // Sort route groups by route name
    this.routeGroups.sort((a, b) => a.routeName.localeCompare(b.routeName));
  }
  
  /**
   * Open confirmation dialog before saving to database
   */
  openConfirmDialog(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.saveToSupabase();
      }
    });
  }

  /**
   * Save parsed data to Supabase
   */
  async saveToSupabase(): Promise<void> {
    if (!this.parsedData || this.parsedData.length === 0) {
      this.snackBar.open('No data to save', 'Close', {
        duration: 5000,
        panelClass: 'error-snackbar'
      });
      return;
    }
    
    // Use Excel Import Service's saveToSupabase method
    const result = await this.excelImportService.saveToSupabase(this.parsedData);
  }
  
  /**
   * Handle route selection change
   */
  onRouteSelectionChange(): void {
    if (this.selectedRoute) {
      const selectedRouteGroup = this.routeGroups.find(route => route.routeName === this.selectedRoute);
      if (selectedRouteGroup) {
        this.selectedRouteStores = selectedRouteGroup.stores;
      } else {
        this.selectedRouteStores = [];
      }
    } else {
      this.selectedRouteStores = [];
    }
  }
  
  /**
   * Get total items for a route
   * @param route Route group
   * @returns Total quantity of items
   */
  getRouteTotalItems(route: RouteGroup): number {
    return route.stores.reduce((sum, store) => sum + store.totalQuantity, 0);
  }
  
  /**
   * Get total crates for a route
   * @param route Route group
   * @returns Total crates needed
   */
  getRouteTotalCrates(route: RouteGroup): number {
    return route.stores.reduce((sum, store) => sum + store.cratesNeeded, 0);
  }
  
  /**
   * Reset the form and clear all data
   */
  resetForm(): void {
    // Clear the file input
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    
    // Reset component state
    this.fileName = '';
    this.parsedData = [];
    this.flattenedData = [];
    this.routeGroups = [];
    this.totalRecords = 0;
    this.selectedRoute = '';
    this.selectedRouteStores = [];
    this.importedStores = [];
    this.groupedImportedStores = [];
    this.displayImportedStores = false;
    this.showInstructions = true;
  }
  
  /**
   * Flatten parsed data for simpler display
   */
  private flattenData(): void {
    this.flattenedData = [];
    
    this.parsedData.forEach(route => {
      route.stores.forEach(store => {
        this.flattenedData.push({
          routeName: route.routeName,
          storeName: store.storeName,
          totalQuantity: store.totalQuantity,
          cratesNeeded: store.cratesNeeded
        });
      });
    });
  }
  
  /**
   * Group imported stores by route
   */
  private groupImportedStoresByRoute(): void {
    // Create a map to group stores by route
    const routeMap = new Map<string, ImportedStore[]>();
    
    // Group stores by route_name
    this.importedStores.forEach(store => {
      if (!routeMap.has(store.route_name)) {
        routeMap.set(store.route_name, []);
      }
      routeMap.get(store.route_name)?.push(store);
    });
    
    // Convert map to array of grouped routes
    this.groupedImportedStores = Array.from(routeMap.entries()).map(([routeName, stores]) => ({
      routeName,
      stores
    }));
    
    // Sort routes alphabetically
    this.groupedImportedStores.sort((a, b) => a.routeName.localeCompare(b.routeName));
  }
  
  /**
   * Calculate total quantity for a route group
   */
  getTotalQuantity(route: GroupedImportedRoute): number {
    return route.stores.reduce((sum, store) => sum + store.total_quantity, 0);
  }
  
  /**
   * Calculate total crates for a route group
   */
  getTotalCrates(route: GroupedImportedRoute): number {
    return route.stores.reduce((sum, store) => sum + store.crates_needed, 0);
  }
  
  /**
   * Get total items for a route by its name
   * @param routeName Name of the route
   * @returns Total quantity of items
   */
  getRouteTotalItemsByName(routeName: string): number {
    const route = this.routeGroups.find(r => r.routeName === routeName);
    return route ? this.getRouteTotalItems(route) : 0;
  }
  
  /**
   * Get total crates for a route by its name
   * @param routeName Name of the route
   * @returns Total crates needed
   */
  getRouteTotalCratesByName(routeName: string): number {
    const route = this.routeGroups.find(r => r.routeName === routeName);
    return route ? this.getRouteTotalCrates(route) : 0;
  }
} 