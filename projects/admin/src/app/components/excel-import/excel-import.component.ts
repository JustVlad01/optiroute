import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
import { Subscription } from 'rxjs';
import { ExcelImportService, ParsedRouteData } from '../../services/excel-import.service';

interface RouteGroup {
  routeName: string;
  storeCount: number;
  stores: {
    storeName: string;
    totalQuantity: number;
    cratesNeeded: number;
  }[];
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
    MatDialogModule
  ],
  templateUrl: './excel-import.component.html',
  styleUrls: ['./excel-import.component.scss']
})
export class ExcelImportComponent implements OnInit, OnDestroy {
  loading = false;
  parsedData: ParsedRouteData[] = [];
  flattenedData: { routeName: string, storeName: string, totalQuantity: number, cratesNeeded: number }[] = [];
  fileName = '';
  showInstructions = true;
  
  // Grouped data for the accordion
  routeGroups: RouteGroup[] = [];
  totalRecords = 0;
  
  displayedColumns: string[] = ['storeName', 'totalQuantity', 'cratesNeeded'];
  
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  private subscriptions: Subscription[] = [];
  
  constructor(
    private excelImportService: ExcelImportService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) { }
  
  ngOnInit(): void {
    // Subscribe to loading state
    this.subscriptions.push(
      this.excelImportService.loading$.subscribe(loading => {
        this.loading = loading;
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
    
    // Subscribe to parsed data
    this.subscriptions.push(
      this.excelImportService.parsedData$.subscribe(data => {
        this.parsedData = data;
        this.processData();
      })
    );
  }
  
  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
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
    
    const result = await this.excelImportService.saveToSupabase(this.parsedData);
    
    if (result.success) {
      this.snackBar.open('Data saved successfully', 'Close', {
        duration: 5000,
        panelClass: 'success-snackbar'
      });
      
      // Reset the form after successful save
      if (this.fileInput) {
        this.fileInput.nativeElement.value = '';
        this.fileName = '';
      }
    }
  }
  
  /**
   * Reset the form
   */
  resetForm(): void {
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
      this.fileName = '';
      this.parsedData = [];
      this.flattenedData = [];
      this.routeGroups = [];
      this.totalRecords = 0;
      this.showInstructions = true;
    }
  }
  
  /**
   * Flatten the parsed data for display in a table
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
} 