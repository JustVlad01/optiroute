declare module 'jspdf' {
  const jsPDF: any;
  export default jsPDF;
}

declare module 'jspdf-autotable' {
  const autoTable: any;
  export default autoTable;
  export interface RowInput extends Array<any> {}
  export interface CellHookData {
    section: string;
    row: any;
    cell: any;
  }
} 