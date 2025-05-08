import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { SupabaseService } from '../../services/supabase.service';

interface StoreOrder {
  customerName: string;
  totalItems: number;
}

interface RouteOrders {
  routeName: string;
  stores: StoreOrder[];
}

interface ParsedImport {
  fileName: string;
  routes: RouteOrders[];
}

@Component({
  selector: 'app-import-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './import-order.component.html',
  styleUrls: ['./import-order.component.scss']
})
export class ImportOrderComponent implements OnInit {
  parsedData: ParsedImport | null = null;
  isLoading: boolean = false;
  errorMessage: string | null = null;
  fileToUpload: File | null = null;
  isSaving: boolean = false;
  successMessage: string | null = null;
  
  // Route expansion state
  routeExpandState: boolean[] = [];

  constructor(private supabaseService: SupabaseService) { }

  ngOnInit(): void {
  }

  onFileChange(event: any): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.parsedData = null;
    this.routeExpandState = [];
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.fileToUpload = target.files[0];
      if (this.fileToUpload && this.fileToUpload.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        this.errorMessage = 'Invalid file type. Please upload an XLSX file.';
        this.fileToUpload = null;
        (event.target as HTMLInputElement).value = ''; // Reset file input
      }
    } else {
      this.fileToUpload = null;
    }
  }

  async parseXLSX(): Promise<void> {
    if (!this.fileToUpload) {
      this.errorMessage = 'Please select a file to import.';
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;
    this.parsedData = null;
    this.routeExpandState = [];

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const bstr: string = e.target.result;
        const wb: XLSX.WorkBook = XLSX.read(bstr, { type: 'binary' });
        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];

        const routes: RouteOrders[] = [];
        let currentRoute: RouteOrders | null = null;

        for (const row of data) {
          const colA = row[0] ? String(row[0]).trim() : '';
          const colB = row[1] ? String(row[1]).trim() : '';
          const colD = row[3]; // Quantity

          if (colA.toUpperCase().includes('DRIVER RUN')) {
            if (currentRoute && currentRoute.stores.length > 0) {
              routes.push(currentRoute);
            }
            currentRoute = { routeName: colB || 'Unknown Route', stores: [] };
          } else if (currentRoute && colA) { // Assuming any non-empty colA after a driver run is a customer
            const quantity = Number(colD);
            if (!isNaN(quantity) && quantity > 0) {
              currentRoute.stores.push({
                customerName: colA,
                totalItems: quantity
              });
            }
          }
        }

        if (currentRoute && currentRoute.stores.length > 0) {
          routes.push(currentRoute);
        }
        
        if (routes.length > 0) {
          this.parsedData = { fileName: this.fileToUpload?.name || 'Unknown File', routes: routes };
          // Initialize all routes to collapsed state
          this.routeExpandState = new Array(routes.length).fill(false);
          // Automatically expand the first route
          if (this.routeExpandState.length > 0) {
            this.routeExpandState[0] = true;
          }
        } else {
          this.errorMessage = 'No valid routes or orders found in the file. Ensure "Driver Run" is present and orders have quantities greater than 0.';
        }

      } catch (error) {
        console.error('Error parsing XLSX:', error);
        this.errorMessage = 'Error parsing the file. Please ensure it is a valid XLSX format and matches the expected structure.';
      } finally {
        this.isLoading = false;
         if (document.getElementById('fileInput')) { // Reset file input
          (document.getElementById('fileInput') as HTMLInputElement).value = '';
        }
        this.fileToUpload = null;
      }
    };
    reader.onerror = (error) => {
        console.error('FileReader error:', error);
        this.errorMessage = 'Could not read the file.';
        this.isLoading = false;
         if (document.getElementById('fileInput')) {
          (document.getElementById('fileInput') as HTMLInputElement).value = '';
        }
        this.fileToUpload = null;
    };
    reader.readAsBinaryString(this.fileToUpload);
  }

  saveImportedData(): void {
    if (!this.parsedData) {
      this.errorMessage = 'No data to save.';
      return;
    }
    
    this.isSaving = true;
    this.errorMessage = null;
    this.successMessage = null;
    
    this.supabaseService.saveImportedOrderData(this.parsedData)
      .then(response => {
        if (response.success) {
          console.log('Import successful via RPC:', response.data);
          this.successMessage = 'Order data successfully imported and saved!';
          this.parsedData = null;
          this.routeExpandState = [];
        } else {
          console.error('Error saving import via RPC:', response.error);
          this.errorMessage = `Failed to save imported data: ${response.error?.message || 'Unknown RPC error'}`;
        }
      })
      .catch(error => {
        console.error('Exception during saveImportedData call:', error);
        this.errorMessage = `Failed to save imported data: ${error.message || 'Unknown exception'}`;
      })
      .finally(() => {
        this.isSaving = false;
      });
  }
  
  // Toggle the expansion state of a route
  toggleRoute(index: number): void {
    if (index >= 0 && index < this.routeExpandState.length) {
      this.routeExpandState[index] = !this.routeExpandState[index];
    }
  }
  
  // Calculate the total number of items in a route
  calculateTotalItems(route: RouteOrders): number {
    return route.stores.reduce((total, store) => total + store.totalItems, 0);
  }
  
  // Calculate the number of crates needed for a route
  calculateCrates(route: RouteOrders): number {
    const totalItems = this.calculateTotalItems(route);
    // Each crate holds 25 items, round up to nearest whole crate
    return Math.ceil(totalItems / 25);
  }
} 