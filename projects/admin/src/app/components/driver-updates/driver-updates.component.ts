import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable, { RowInput, CellInput } from 'jspdf-autotable';

// Custom interfaces for strongly typed table data
interface StoreTableRow {
  shop: string;
  route: string;
  storeName: string;
  storeCode: string;
}

interface DeliveryTimeRow {
  shop: string;
  time: string;
  route: string;
}

interface CommentRow {
  route: string;
  comment: string;
}

interface SelectedStore {
  deliveryIndex: number;
  storeIndex: number;
  storeData: any;
}

@Component({
  selector: 'app-driver-updates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-updates.component.html',
  styleUrls: ['./driver-updates.component.scss']
})
export class DriverUpdatesComponent implements OnInit {
  driverUpdates: any[] = [];
  loading: boolean = true;
  selectedUpdate: any = null;
  startOfToday: string;
  endOfToday: string;
  page: number = 0;
  pageSize: number = 10;
  totalCount: number = 0;
  viewMode: 'list' | 'detail' = 'list';
  Math = Math;
  selectedStores: SelectedStore[] = [];
  selectedUpdates: Set<number> = new Set(); // Track selected updates by ID

  constructor(private supabaseService: SupabaseService) {
    // Set start and end of today in ISO format for the query
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.startOfToday = today.toISOString();
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.endOfToday = tomorrow.toISOString();
  }

  ngOnInit(): void {
    this.loadTodaysUpdates();
  }

  async loadTodaysUpdates(): Promise<void> {
    this.loading = true;
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('*, drivers(name, custom_id)')
        .gte('created_at', this.startOfToday)
        .lt('created_at', this.endOfToday)
        .order('created_at', { ascending: false })
        .range(this.page * this.pageSize, (this.page + 1) * this.pageSize - 1);

      if (error) throw error;

      const count = await this.getTotalCount();
      this.totalCount = count;
      this.driverUpdates = data || [];
      console.log('Loaded driver updates:', this.driverUpdates);
    } catch (error) {
      console.error('Error loading today\'s driver updates:', error);
      this.driverUpdates = [];
    } finally {
      this.loading = false;
    }
  }

  async getTotalCount(): Promise<number> {
    try {
      const { count, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', this.startOfToday)
        .lt('created_at', this.endOfToday);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting count:', error);
      return 0;
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  viewUpdateDetails(update: any): void {
    this.selectedUpdate = update;
    this.viewMode = 'detail';
    this.selectedStores = []; // Reset selected stores when viewing a new update
  }

  backToList(): void {
    this.viewMode = 'list';
    this.selectedUpdate = null;
    this.selectedStores = [];
  }

  nextPage(): void {
    if ((this.page + 1) * this.pageSize < this.totalCount) {
      this.page++;
      this.loadTodaysUpdates();
    }
  }

  prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.loadTodaysUpdates();
    }
  }

  getDeliveryCount(update: any): number {
    if (!update.delivery_data || !Array.isArray(update.delivery_data)) {
      return 0;
    }
    return update.delivery_data.length;
  }

  getStoreCount(update: any): number {
    if (!update.delivery_data || !Array.isArray(update.delivery_data)) {
      return 0;
    }
    
    let storeCount = 0;
    for (const delivery of update.delivery_data) {
      if (delivery.stores && Array.isArray(delivery.stores)) {
        storeCount += delivery.stores.length;
      }
    }
    return storeCount;
  }

  // New methods for store selection and PDF export
  getAllStoresFromDeliveries(): any[] {
    if (!this.selectedUpdate?.delivery_data) return [];
    
    let allStores: any[] = [];
    this.selectedUpdate.delivery_data.forEach((delivery: any, deliveryIndex: number) => {
      if (delivery.stores && Array.isArray(delivery.stores)) {
        delivery.stores.forEach((store: any, storeIndex: number) => {
          allStores.push({
            deliveryIndex,
            storeIndex,
            storeData: {
              ...store,
              shop_name: delivery.shop_name,
              delivery_time: delivery.delivery_time
            }
          });
        });
      }
    });
    
    return allStores;
  }

  toggleStoreSelection(deliveryIndex: number, storeIndex: number): void {
    const storeKey = `${deliveryIndex}-${storeIndex}`;
    const existingIndex = this.selectedStores.findIndex(
      s => s.deliveryIndex === deliveryIndex && s.storeIndex === storeIndex
    );
    
    if (existingIndex > -1) {
      // Remove if already selected
      this.selectedStores.splice(existingIndex, 1);
    } else {
      // Add to selection with full store data for PDF generation
      const delivery = this.selectedUpdate.delivery_data[deliveryIndex];
      const store = delivery.stores[storeIndex];
      
      this.selectedStores.push({
        deliveryIndex,
        storeIndex,
        storeData: {
          ...store,
          shop_name: delivery.shop_name,
          delivery_time: delivery.delivery_time
        }
      });
    }
  }

  isStoreSelected(deliveryIndex: number, storeIndex: number): boolean {
    return this.selectedStores.some(
      s => s.deliveryIndex === deliveryIndex && s.storeIndex === storeIndex
    );
  }

  hasSelectedStores(): boolean {
    return this.selectedStores.length > 0;
  }

  selectAllStores(): void {
    this.selectedStores = this.getAllStoresFromDeliveries();
  }

  deselectAllStores(): void {
    this.selectedStores = [];
  }

  exportSelectedStores(): void {
    if (!this.hasSelectedStores()) return;
    
    try {
      const doc = new jsPDF();
      const driverName = this.selectedUpdate.drivers?.name || 'Unknown Driver';
      const routeName = this.selectedUpdate.route_name || 'No Route';
      const reportDate = this.formatDate(this.selectedUpdate.created_at);
      
      // Add title and metadata
      doc.setFontSize(18);
      doc.text('Driver Delivery Update Report', 14, 22);
      
      doc.setFontSize(12);
      doc.text(`Driver: ${driverName}`, 14, 32);
      doc.text(`Route: ${routeName}`, 14, 38);
      doc.text(`Date: ${reportDate}`, 14, 44);
      
      // Add comments if available
      if (this.selectedUpdate.comments) {
        doc.setFontSize(14);
        doc.text('Driver Comments:', 14, 55);
        doc.setFontSize(10);
        
        const splitComments = doc.splitTextToSize(this.selectedUpdate.comments, 180);
        doc.text(splitComments, 14, 62);
      }
      
      // Prepare table data
      const tableData: any[] = this.selectedStores.map(selected => {
        const { storeData } = selected;
        return [
          storeData.shop_name || 'N/A',
          storeData.delivery_time || 'N/A',
          storeData.store_name || 'N/A',
          storeData.store_code || 'N/A'
        ];
      });
      
      // Sort by delivery time
      tableData.sort((a: any[], b: any[]) => {
        const timeA = a[1] as string;
        const timeB = b[1] as string;
        
        return timeA.localeCompare(timeB);
      });
      
      // Set Y position based on whether we have comments
      const tableY = this.selectedUpdate.comments ? 75 : 55;
      
      // Add the table
      let finalY = tableY;
      doc.setFontSize(14);
      doc.text('Delivery Update - Outstanding Deliveries', 14, tableY - 10);
      
      // Create a variable for colors
      const lightBlue: [number, number, number] = [200, 220, 240]; // Light blue color for alternating rows
      const headerBlue: [number, number, number] = [45, 140, 255]; // Blue color for headers
      
      autoTable(doc, {
        startY: tableY,
        head: [['Shop', 'Delivery Time', 'Store Name', 'Store Code']],
        body: tableData as unknown as RowInput[],
        theme: 'grid',
        headStyles: { fillColor: headerBlue },
        didParseCell: function(data) {
          // Color rows based on route
          if (data.section === 'body') {
            const rowData = data.row.raw as any[];
            const route = rowData[1]; // Route/time is in second column
            
            // Check if this is an even-indexed route
            const routeNumber = extractRouteNumberForStyle(route);
            if (routeNumber % 2 === 0) {
              data.cell.styles.fillColor = lightBlue;
            }
          }
        },
        didDrawPage: function(data) {
          finalY = data.cursor?.y ?? finalY;
        }
      });
      
      // Add last delivery times if available
      if (this.selectedUpdate.last_delivery_times) {
        // Get position after last table
        const lastDeliveryY = finalY + 15;
        
        doc.setFontSize(14);
        doc.text('Last Delivery Times:', 14, lastDeliveryY);
        
        // Create a variable for colors
        const lightBlue: [number, number, number] = [200, 220, 240]; // Light blue color for alternating rows
        const headerBlue: [number, number, number] = [45, 140, 255]; // Blue color for headers
        
        const lastDeliveryEntries = Object.entries(this.selectedUpdate.last_delivery_times);
        
        if (lastDeliveryEntries.length > 0) {
          // Sort by shop name
          lastDeliveryEntries.sort((a: any[], b: any[]) => {
            const shopA = a[0] as string;
            const shopB = b[0] as string;
            
            return shopA.localeCompare(shopB);
          });
          
          autoTable(doc, {
            startY: lastDeliveryY + 7,
            head: [['Shop', 'Time']],
            body: lastDeliveryEntries as unknown as RowInput[],
            theme: 'grid',
            headStyles: { fillColor: headerBlue },
            didParseCell: function(data) {
              // Color rows for even-indexed shops
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const shop = rowData[0]; // Shop is first column
                
                // Use every second shop for coloring
                const shopIndex = lastDeliveryEntries.findIndex(
                  (s: any[]) => s[0] === shop
                );
                
                if (shopIndex % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            }
          });
        }
      }
      
      // Save the PDF
      const fileName = `driver_update_${driverName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  }

  exportFullUpdate(update: any): void {
    try {
      const doc = new jsPDF();
      const driverName = update.drivers?.name || 'Unknown Driver';
      const routeName = update.route_name || 'No Route';
      const reportDate = this.formatDate(update.created_at);
      
      // Add title and metadata
      doc.setFontSize(18);
      doc.text('Driver Delivery Update Report', 14, 22);
      
      doc.setFontSize(12);
      doc.text(`Driver: ${driverName}`, 14, 32);
      doc.text(`Route: ${routeName}`, 14, 38);
      doc.text(`Date: ${reportDate}`, 14, 44);
      
      // Add comments if available
      let yPosition = 55;
      if (update.comments) {
        doc.setFontSize(14);
        doc.text('Driver Comments:', 14, yPosition);
        doc.setFontSize(10);
        
        const splitComments = doc.splitTextToSize(update.comments, 180);
        doc.text(splitComments, 14, yPosition + 7);
        yPosition += 15 + (splitComments.length * 5);
      }
      
      // Prepare complete data for all stores
      if (update.delivery_data && Array.isArray(update.delivery_data)) {
        const allStoresData: any[] = [];
        update.delivery_data.forEach((delivery: any) => {
          if (delivery.stores && Array.isArray(delivery.stores)) {
            delivery.stores.forEach((store: any) => {
              allStoresData.push([
                delivery.shop_name || 'N/A',
                delivery.delivery_time || 'N/A',
                store.store_name || 'N/A',
                store.store_code || 'N/A'
              ]);
            });
          }
        });
        
        if (allStoresData.length > 0) {
          // Sort by route number
          allStoresData.sort((a: any[], b: any[]) => {
            const routeA = a[1] as string;
            const routeB = b[1] as string;
            
            const numA = this.extractRouteNumber(routeA);
            const numB = this.extractRouteNumber(routeB);
            
            return numA - numB;
          });
          
          // Add the table with all stores
          let storesTableFinalY = yPosition;
          doc.setFontSize(14);
          doc.text('Delivery Update - Outstanding Deliveries', 14, yPosition);
          yPosition += 7;
          
          // Define colors
          const lightBlue: [number, number, number] = [200, 220, 240];
          const headerBlue: [number, number, number] = [45, 140, 255];
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Shop', 'Delivery Time', 'Store Name', 'Store Code']],
            body: allStoresData as unknown as RowInput[],
            theme: 'grid',
            headStyles: { fillColor: headerBlue },
            didParseCell: function(data) {
              // Color rows based on route
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const route = rowData[1]; // Delivery time column
                
                // Get route number and color even routes
                const routeNumber = extractRouteNumberForStyle(route);
                if (routeNumber % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            },
            didDrawPage: function(data) {
              storesTableFinalY = data.cursor?.y ?? storesTableFinalY;
            }
          });
          
          // Get position after table
          yPosition = storesTableFinalY + 15;
        }
      }
      
      // Add last delivery times if available
      if (update.last_delivery_times) {
        doc.setFontSize(14);
        doc.text('Last Delivery Times:', 14, yPosition);
        
        // Define colors for this section
        const lightBlue: [number, number, number] = [200, 220, 240];
        const headerBlue: [number, number, number] = [45, 140, 255];
        
        const lastDeliveryEntries = Object.entries(update.last_delivery_times);
        
        if (lastDeliveryEntries.length > 0) {
          // Sort by route (shop name)
          lastDeliveryEntries.sort((a: any[], b: any[]) => {
            const shopA = a[0] as string;
            const shopB = b[0] as string;
            
            const numA = this.extractRouteNumber(shopA);
            const numB = this.extractRouteNumber(shopB);
            
            return numA - numB;
          });
          
          autoTable(doc, {
            startY: yPosition + 7,
            head: [['Shop', 'Time']],
            body: lastDeliveryEntries as unknown as RowInput[],
            theme: 'grid',
            headStyles: { fillColor: headerBlue },
            didParseCell: function(data) {
              // Color rows based on shop (which is equivalent to route in this context)
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const shop = rowData[0]; // Shop is first column
                
                // Use a consistent method for determining color
                const shopIndex = lastDeliveryEntries.findIndex(
                  (s: any[]) => s[0] === shop
                );
                
                if (shopIndex % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            }
          });
        }
      }
      
      // Save the PDF
      const fileName = `driver_update_${driverName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  }

  // Methods for handling multiple selection
  toggleUpdateSelection(updateId: number): void {
    if (this.selectedUpdates.has(updateId)) {
      this.selectedUpdates.delete(updateId);
    } else {
      this.selectedUpdates.add(updateId);
    }
  }

  isUpdateSelected(updateId: number): boolean {
    return this.selectedUpdates.has(updateId);
  }

  selectAllUpdates(): void {
    this.driverUpdates.forEach(update => {
      if (update.id) {
        this.selectedUpdates.add(update.id);
      }
    });
  }

  deselectAllUpdates(): void {
    this.selectedUpdates.clear();
  }

  hasSelectedUpdates(): boolean {
    return this.selectedUpdates.size > 0;
  }

  // Method to export multiple updates in a highly condensed format
  async exportSelectedUpdates(): Promise<void> {
    if (!this.hasSelectedUpdates()) return;
    
    try {
      // Collect all selected updates
      const selectedUpdateIds = Array.from(this.selectedUpdates);
      const updates = this.driverUpdates.filter(update => selectedUpdateIds.includes(update.id));
      
      if (updates.length === 0) {
        alert('No updates selected for export.');
        return;
      }
      
      const doc = new jsPDF();
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      
      // Add title
      doc.setFontSize(14);
      doc.text('Combined Driver Delivery Updates Report', 14, 15);
      doc.setFontSize(8);
      doc.text(`Date: ${today} | Total Updates: ${updates.length}`, 14, 20);
      
      let yPosition = 25;
      
      // Define colors for all tables
      const lightBlue: [number, number, number] = [200, 220, 240]; // Light blue color for alternating rows
      const headerBlue: [number, number, number] = [45, 140, 255]; // Blue color for headers
      
      // Create a highly condensed report format
      
      // 1. Outstanding deliveries section - all stores from all forms in one table
      const storesWithDeliveries = updates.filter(update => 
        update.delivery_data && 
        Array.isArray(update.delivery_data) && 
        update.delivery_data.some((delivery: any) => delivery.stores && delivery.stores.length > 0)
      );
      
      if (storesWithDeliveries.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Delivery Update - Outstanding Deliveries', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        // Use any[] type for flexibility
        const allStoresData: any[] = [];
        
        storesWithDeliveries.forEach(update => {
          const routeName = update.route_name || 'N/A';
          if (update.delivery_data && Array.isArray(update.delivery_data)) {
            update.delivery_data.forEach((delivery: any) => {
              if (delivery.stores && Array.isArray(delivery.stores)) {
                delivery.stores.forEach((store: any) => {
                  allStoresData.push([
                    delivery.shop_name || 'N/A',
                    routeName,
                    store.store_name || 'N/A',
                    store.store_code || 'N/A'
                  ]);
                });
              }
            });
          }
        });
        
        if (allStoresData.length > 0) {
          // Sort by route number
          allStoresData.sort((a: any[], b: any[]) => {
            const routeA = a[1] as string;
            const routeB = b[1] as string;
            
            const numA = this.extractRouteNumber(routeA);
            const numB = this.extractRouteNumber(routeB);
            
            return numA - numB;
          });
          
          // Get unique routes for alternating colors
          const uniqueRoutes = Array.from(new Set(allStoresData.map((row: any[]) => row[1])));
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Shop', 'Route', 'Store Name', 'Store Code']],
            body: allStoresData as unknown as RowInput[],
            theme: 'grid',
            headStyles: { 
              fillColor: headerBlue,
              fontSize: 8,
              cellPadding: 2
            },
            bodyStyles: {
              fontSize: 7,
              cellPadding: 1
            },
            columnStyles: {
              0: { cellWidth: 25 },
              1: { cellWidth: 25 },
              2: { cellWidth: 'auto' },
              3: { cellWidth: 20 }
            },
            margin: { left: 10, right: 10 },
            didParseCell: function(data) {
              // Color rows based on route
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const route = rowData[1]; // Route is in second column
                
                // Get the route's index in the unique routes array
                const routeIndex = uniqueRoutes.indexOf(route);
                if (routeIndex % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            },
            didDrawPage: (data) => {
              yPosition = data.cursor?.y ?? yPosition;
            }
          });
        }
        
        yPosition += 5;
      }
      
      // 2. Last delivery times table
      const updatesWithDeliveryTimes = updates.filter(update => 
        update.last_delivery_times && 
        Object.keys(update.last_delivery_times).length > 0
      );
      
      if (updatesWithDeliveryTimes.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Last Delivery Times', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        // Use any[] type for flexibility
        const allDeliveryTimes: any[] = [];
        
        updatesWithDeliveryTimes.forEach(update => {
          const routeName = update.route_name || 'N/A';
          if (update.last_delivery_times) {
            Object.entries(update.last_delivery_times).forEach(([shop, time]) => {
              allDeliveryTimes.push([
                shop,
                time as string,
                routeName
              ]);
            });
          }
        });
        
        if (allDeliveryTimes.length > 0) {
          // Sort by route number
          allDeliveryTimes.sort((a: any[], b: any[]) => {
            const routeA = a[2] as string;
            const routeB = b[2] as string;
            
            const numA = this.extractRouteNumber(routeA);
            const numB = this.extractRouteNumber(routeB);
            
            return numA - numB;
          });
          
          // Get unique routes for alternating colors
          const uniqueRoutes = Array.from(new Set(allDeliveryTimes.map((row: any[]) => row[2])));
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Shop', 'Last Delivery Time', 'Route']],
            body: allDeliveryTimes as unknown as RowInput[],
            theme: 'grid',
            headStyles: { 
              fillColor: headerBlue,
              fontSize: 8,
              cellPadding: 2
            },
            bodyStyles: {
              fontSize: 7,
              cellPadding: 1
            },
            margin: { left: 10, right: 10 },
            didParseCell: function(data) {
              // Color rows based on route
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const route = rowData[2]; // Route is in third column
                
                // Get the route's index in the unique routes array
                const routeIndex = uniqueRoutes.indexOf(route);
                if (routeIndex % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            },
            didDrawPage: (data) => {
              yPosition = data.cursor?.y ?? yPosition;
            }
          });
        }
        
        yPosition += 5;
      }
      
      // 3. Add comments section only if there are comments
      const driversWithComments = updates.filter(update => update.comments && update.comments.trim() !== '');
      
      if (driversWithComments.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Driver Comments', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        // Use any[] type for flexibility
        const commentsData: any[] = driversWithComments.map(update => {
          return [
            update.route_name || 'N/A',
            update.comments || ''
          ];
        });
        
        // Sort comments by route number
        commentsData.sort((a: any[], b: any[]) => {
          const routeA = a[0] as string;
          const routeB = b[0] as string;
          
          const numA = this.extractRouteNumber(routeA);
          const numB = this.extractRouteNumber(routeB);
          
          return numA - numB;
        });
        
        // Get unique routes for alternating colors
        const uniqueRoutes = Array.from(new Set(commentsData.map((row: any[]) => row[0])));
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Route', 'Comments']],
          body: commentsData as unknown as RowInput[],
          theme: 'grid',
          headStyles: { 
            fillColor: headerBlue,
            fontSize: 8,
            cellPadding: 2
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 2
          },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 'auto' }
          },
          margin: { left: 10, right: 10 },
          didParseCell: function(data) {
            // Color rows based on route
            if (data.section === 'body') {
              const rowData = data.row.raw as any[];
              const route = rowData[0]; // Route is in first column
              
              // Get the route's index in the unique routes array
              const routeIndex = uniqueRoutes.indexOf(route);
              if (routeIndex % 2 === 0) {
                data.cell.styles.fillColor = lightBlue;
              }
            }
          }
        });
      }
      
      // Save the PDF
      const fileName = `combined_driver_updates_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating combined PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  }

  // Helper function for extracting route number for styling purposes
  private extractRouteNumber(routeName: string): number {
    if (!routeName) return Infinity; // Handle undefined/empty route names
    
    // Match numbers in the route name
    const match = routeName.match(/\d+/);
    if (match) {
      return parseInt(match[0], 10);
    }
    return Infinity; // If no number found, put at the end
  }
}

// Helper function for extracting route number for styling purposes
function extractRouteNumberForStyle(routeName: string): number {
  if (!routeName) return 0;
  
  // Match numbers in the route name
  const match = routeName.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return 0;
} 