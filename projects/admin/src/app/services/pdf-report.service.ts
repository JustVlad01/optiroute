import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface VanIssue {
  id: string;
  driver_id: string;
  van_registration: string;
  driver_comments: string;
  image_urls: string[];
  created_at: string;
  verified: boolean;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
  date_fixed?: string;
  driver_name?: string;
  driver_custom_id?: string;
  driver_phone?: string;
  driver_location?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfReportService {

  constructor() { }

  generateVanIssuesReport(issues: VanIssue[], reportTitle: string = 'Van Issues Report'): void {
    const doc = new jsPDF();
    
    // Company colors and styling
    const primaryColor = [10, 49, 97]; // #0a3161
    const secondaryColor = [40, 167, 69]; // #28a745
    const lightGray = [248, 249, 250]; // #f8f9fa
    const darkGray = [73, 80, 87]; // #495057

    // Header
    this.addHeader(doc, reportTitle, primaryColor);
    
    // Report metadata
    this.addReportMetadata(doc, issues.length);
    
    // Issues table
    this.addIssuesTable(doc, issues, primaryColor, secondaryColor);
    
    // Footer
    this.addFooter(doc, primaryColor);
    
    // Save the PDF
    const fileName = `${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }

  private addHeader(doc: jsPDF, title: string, primaryColor: number[]): void {
    // Company header background - made much smaller
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 18, 'F');
    
    // Report title only (removed company name)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, 12);
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
  }

  private addReportMetadata(doc: jsPDF, totalIssues: number): void {
    const currentY = 28; // Adjusted to account for smaller header
    
    // Report info box
    doc.setFillColor(248, 249, 250);
    doc.rect(20, currentY, 170, 15, 'F'); // Made smaller height
    doc.setDrawColor(233, 236, 239);
    doc.rect(20, currentY, 170, 15, 'S');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    // Put both on the same row
    doc.text('Report Generated:', 25, currentY + 8);
    doc.text('Total Issues:', 120, currentY + 8); // Positioned on the same line
    
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }), 25, currentY + 12); // Moved to second line under "Report Generated"
    doc.text(totalIssues.toString(), 150, currentY + 8); // On same line as "Total Issues"
  }

  private addIssuesTable(doc: jsPDF, issues: VanIssue[], primaryColor: number[], secondaryColor: number[]): void {
    const tableData = issues.map(issue => [
      issue.van_registration || 'N/A',
      issue.driver_name || 'Unknown',
      issue.driver_custom_id || 'N/A',
      issue.driver_comments || 'No description',
      this.formatDate(issue.created_at),
      issue.date_fixed ? this.formatDate(issue.date_fixed) : 'Not Fixed',
      issue.verified ? 'Verified' : 'Pending',
      issue.image_urls?.length ? `${issue.image_urls.length} image(s)` : 'No images'
    ]);

    autoTable(doc, {
      head: [['Vehicle', 'Driver', 'Driver ID', 'Issue Description', 'Reported Date', 'Fixed Date', 'Status', 'Images']],
      body: tableData,
      startY: 53,
      theme: 'grid',
      margin: { left: 7, right: 7 },
      tableWidth: 'wrap',
      styles: {
        overflow: 'linebreak',
        cellWidth: 'wrap'
      },
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle'
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 3,
        lineColor: [233, 236, 239],
        lineWidth: 0.1,
        valign: 'top',
        overflow: 'linebreak',
        cellWidth: 'wrap'
      },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center', valign: 'middle' }, // Vehicle - reduced
        1: { cellWidth: 22, valign: 'middle' }, // Driver - reduced
        2: { cellWidth: 12, halign: 'center', valign: 'middle' }, // Driver ID - reduced
        3: { 
          cellWidth: 60, 
          valign: 'top',
          overflow: 'linebreak',
          cellPadding: { top: 3, right: 2, bottom: 3, left: 2 }
        }, // Issue Description - reduced but still generous
        4: { cellWidth: 20, halign: 'center', valign: 'middle' }, // Reported Date - reduced
        5: { cellWidth: 20, halign: 'center', valign: 'middle' }, // Fixed Date - reduced
        6: { cellWidth: 18, halign: 'center', valign: 'middle' }, // Status - reduced
        7: { cellWidth: 18, halign: 'center', valign: 'middle' } // Images - reduced
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250]
      },
      didParseCell: (data: any) => {
        // Color code status column
        if (data.column.index === 6) { // Status column
          if (data.cell.text[0] === 'Verified') {
            data.cell.styles.textColor = secondaryColor;
            data.cell.styles.fontStyle = 'bold';
          } else if (data.cell.text[0] === 'Pending') {
            data.cell.styles.textColor = [255, 193, 7];
            data.cell.styles.fontStyle = 'bold';
          }
        }
        
        // Color code fixed date column
        if (data.column.index === 5 && data.cell.text[0] !== 'Not Fixed') {
          data.cell.styles.textColor = secondaryColor;
          data.cell.styles.fontStyle = 'bold';
        }
        
        // Handle issue description column with proper text wrapping
        if (data.column.index === 3) { // Issue Description column
          // Force text wrapping and set minimum height
          data.cell.styles.overflow = 'linebreak';
          data.cell.styles.cellWidth = 'wrap';
          data.cell.styles.valign = 'top';
          data.cell.styles.minCellHeight = 15; // Ensure minimum height for readability
          
          // Split long text into multiple lines if needed
          const cellText = data.cell.text.join(' ');
          if (cellText.length > 50) {
            // Use jsPDF's splitTextToSize to properly wrap text
            const wrappedText = doc.splitTextToSize(cellText, 55); // Adjusted width for proper fit
            data.cell.text = wrappedText;
            
            // Adjust height based on number of lines
            const lineCount = wrappedText.length;
            data.cell.styles.minCellHeight = Math.max(15, lineCount * 4 + 6);
          }
        }
      },
      // Handle page breaks properly with variable row heights
      didDrawPage: (data: any) => {
        // This ensures proper page handling when rows have different heights
      }
    });
  }

  private addFooter(doc: jsPDF, primaryColor: number[]): void {
    const pageHeight = doc.internal.pageSize.height;
    
    // Footer line
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.5);
    doc.line(20, pageHeight - 20, 190, pageHeight - 20);
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(108, 117, 125);
    doc.text('Generated by Around Noon Driver Management System', 20, pageHeight - 12);
    doc.text(`Page 1 of 1 | Generated on ${new Date().toLocaleDateString('en-GB')}`, 20, pageHeight - 6);
  }

  private formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  // Method for generating filtered reports
  generateFilteredReport(
    allIssues: VanIssue[], 
    filters: {
      status?: 'all' | 'verified' | 'pending';
      dateRange?: { start: string; end: string };
      vehicles?: string[];
    }
  ): void {
    let filteredIssues = [...allIssues];
    let reportTitle = 'Van Issues Report';

    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'verified') {
        filteredIssues = filteredIssues.filter(issue => issue.verified);
        reportTitle += ' - Verified Issues';
      } else if (filters.status === 'pending') {
        filteredIssues = filteredIssues.filter(issue => !issue.verified);
        reportTitle += ' - Pending Issues';
      }
    }

    // Apply date range filter
    if (filters.dateRange) {
      const startDate = new Date(filters.dateRange.start);
      const endDate = new Date(filters.dateRange.end);
      filteredIssues = filteredIssues.filter(issue => {
        const issueDate = new Date(issue.created_at);
        return issueDate >= startDate && issueDate <= endDate;
      });
      reportTitle += ` - ${this.formatDate(filters.dateRange.start)} to ${this.formatDate(filters.dateRange.end)}`;
    }

    // Apply vehicle filter
    if (filters.vehicles && filters.vehicles.length > 0) {
      filteredIssues = filteredIssues.filter(issue => 
        filters.vehicles!.includes(issue.van_registration)
      );
      if (filters.vehicles.length === 1) {
        reportTitle += ` - Vehicle ${filters.vehicles[0]}`;
      } else {
        reportTitle += ` - Selected Vehicles`;
      }
    }

    this.generateVanIssuesReport(filteredIssues, reportTitle);
  }

  // Method for generating detailed reports with full descriptions
  generateDetailedReport(
    allIssues: VanIssue[], 
    filters: {
      status?: 'all' | 'verified' | 'pending';
      dateRange?: { start: string; end: string };
      vehicles?: string[];
    }
  ): void {
    let filteredIssues = [...allIssues];
    let reportTitle = 'Detailed Van Issues Report';

    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'verified') {
        filteredIssues = filteredIssues.filter(issue => issue.verified);
        reportTitle += ' - Verified Issues';
      } else if (filters.status === 'pending') {
        filteredIssues = filteredIssues.filter(issue => !issue.verified);
        reportTitle += ' - Pending Issues';
      }
    }

    // Apply date range filter
    if (filters.dateRange) {
      const startDate = new Date(filters.dateRange.start);
      const endDate = new Date(filters.dateRange.end);
      filteredIssues = filteredIssues.filter(issue => {
        const issueDate = new Date(issue.created_at);
        return issueDate >= startDate && issueDate <= endDate;
      });
      reportTitle += ` - ${this.formatDate(filters.dateRange.start)} to ${this.formatDate(filters.dateRange.end)}`;
    }

    // Apply vehicle filter
    if (filters.vehicles && filters.vehicles.length > 0) {
      filteredIssues = filteredIssues.filter(issue => 
        filters.vehicles!.includes(issue.van_registration)
      );
      if (filters.vehicles.length === 1) {
        reportTitle += ` - Vehicle ${filters.vehicles[0]}`;
      } else {
        reportTitle += ` - Selected Vehicles`;
      }
    }

    this.generateDetailedVanIssuesReport(filteredIssues, reportTitle);
  }

  private generateDetailedVanIssuesReport(issues: VanIssue[], reportTitle: string): void {
    const doc = new jsPDF();
    
    // Company colors and styling
    const primaryColor = [10, 49, 97]; // #0a3161
    const secondaryColor = [40, 167, 69]; // #28a745

    // Header
    this.addHeader(doc, reportTitle, primaryColor);
    
    // Report metadata
    this.addReportMetadata(doc, issues.length);
    
    // Detailed issues list
    this.addDetailedIssuesList(doc, issues, primaryColor, secondaryColor);
    
    // Footer
    this.addFooter(doc, primaryColor);
    
    // Save the PDF
    const fileName = `${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }

  private addDetailedIssuesList(doc: jsPDF, issues: VanIssue[], primaryColor: number[], secondaryColor: number[]): void {
    let currentY = 58; // Adjusted from 85 to account for smaller header
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const lineHeight = 6;

    issues.forEach((issue, index) => {
      // Check if we need a new page
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 30;
      }

      // Issue header
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(margin, currentY, 170, 12, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Issue #${index + 1} - Vehicle: ${issue.van_registration}`, margin + 5, currentY + 8);
      
      currentY += 15;

      // Issue details
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      // Driver info
      doc.setFont('helvetica', 'bold');
      doc.text('Driver:', margin, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(`${issue.driver_name} (ID: ${issue.driver_custom_id})`, margin + 25, currentY);
      currentY += lineHeight;

      // Date info
      doc.setFont('helvetica', 'bold');
      doc.text('Reported:', margin, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(this.formatDate(issue.created_at), margin + 25, currentY);
      
      if (issue.date_fixed) {
        doc.setFont('helvetica', 'bold');
        doc.text('Fixed:', margin + 80, currentY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.text(this.formatDate(issue.date_fixed), margin + 95, currentY);
        doc.setTextColor(0, 0, 0);
      }
      currentY += lineHeight;

      // Status
      doc.setFont('helvetica', 'bold');
      doc.text('Status:', margin, currentY);
      doc.setFont('helvetica', 'bold');
      if (issue.verified) {
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.text('VERIFIED', margin + 25, currentY);
      } else {
        doc.setTextColor(255, 193, 7);
        doc.text('PENDING', margin + 25, currentY);
      }
      doc.setTextColor(0, 0, 0);
      currentY += lineHeight + 2;

      // Issue description
      doc.setFont('helvetica', 'bold');
      doc.text('Issue Description:', margin, currentY);
      currentY += lineHeight;

      doc.setFont('helvetica', 'normal');
      const description = issue.driver_comments || 'No description provided';
      const splitDescription = doc.splitTextToSize(description, 150);
      
      splitDescription.forEach((line: string) => {
        if (currentY > pageHeight - 30) {
          doc.addPage();
          currentY = 30;
        }
        doc.text(line, margin + 5, currentY);
        currentY += lineHeight;
      });

      // Images info
      if (issue.image_urls && issue.image_urls.length > 0) {
        currentY += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Images:', margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(`${issue.image_urls.length} image(s) attached`, margin + 25, currentY);
        currentY += lineHeight;
      }

      // Separator line
      currentY += 5;
      doc.setDrawColor(233, 236, 239);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, 190, currentY);
      currentY += 10;
    });
  }
} 