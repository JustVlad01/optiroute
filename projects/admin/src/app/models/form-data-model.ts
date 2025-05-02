export class FormDataModel {
  driverName: string = '';
  date: string = '';
  time: string = '';
  vanRegistration: string = '';
  startingMileage: number | null = null;
  fuelAdded: boolean = false;
  litresAdded: number | null = null;
  fuelCardReg: string | null = null;
  fullUniform: boolean = false;
  allSiteKeys: boolean = false;
  workStartTime: string = '';
  preloadVanTemp: number | null = null;
  preloadProductTemp: number | null = null;
  auxiliaryProducts: boolean = false;
  numberOfCratesOut: number | null = null;
  vanProbeSerialNumber: string | null = null;
  paperworkIssues: boolean = false;
  paperworkIssuesReason: string | null = null;
  ordersProductsIssues: boolean = false;
  ordersProductsIssuesReason: string | null = null;
  siteIssues: boolean = false;
  siteIssuesReason: string | null = null;
  customerComplaints: boolean = false;
  customerComplaintsReason: string | null = null;
  productComplaints: boolean = false;
  productComplaintsReason: string | null = null;
  closingMileage: number | null = null;
  recycledAllReturns: boolean = false;
  vanFridgeWorking: boolean = false;
  returnedVanProbe: boolean = false;
  cabCleaned: boolean = false;
  cabNotCleanedReason: string | null = null;
  chemicalsUsed: string | null = null;
  vanIssues: string | null = null;
  repairsNeeded: string | null = null;
  numberOfCratesIn: number | null = null;
  needs_review?: boolean;
  
  // Helper method to convert snake_case server response to camelCase
  static fromServerResponse(data: any): FormDataModel {
    const model = new FormDataModel();
    if (!data) return model;
    
    model.driverName = data.driver_name || '';
    model.date = data.date || '';
    model.time = data.time || '';
    model.vanRegistration = data.van_registration || '';
    model.startingMileage = data.starting_mileage || null;
    model.fuelAdded = data.fuel_added || false;
    model.litresAdded = data.litres_added || null;
    model.fuelCardReg = data.fuel_card_reg || null;
    model.fullUniform = data.full_uniform || false;
    model.allSiteKeys = data.all_site_keys || false;
    model.workStartTime = data.work_start_time || '';
    model.preloadVanTemp = data.preload_van_temp || null;
    model.preloadProductTemp = data.preload_product_temp || null;
    model.auxiliaryProducts = data.auxiliary_products || false;
    model.numberOfCratesOut = data.number_of_crates_out || null;
    model.vanProbeSerialNumber = data.van_probe_serial_number || null;
    model.paperworkIssues = data.paperwork_issues || false;
    model.paperworkIssuesReason = data.paperwork_issues_reason || null;
    model.ordersProductsIssues = data.orders_products_issues || false;
    model.ordersProductsIssuesReason = data.orders_products_issues_reason || null;
    model.siteIssues = data.site_issues || false;
    model.siteIssuesReason = data.site_issues_reason || null;
    model.customerComplaints = data.customer_complaints || false;
    model.customerComplaintsReason = data.customer_complaints_reason || null;
    model.productComplaints = data.product_complaints || false;
    model.productComplaintsReason = data.product_complaints_reason || null;
    model.closingMileage = data.closing_mileage || null;
    model.recycledAllReturns = data.recycled_all_returns || false;
    model.vanFridgeWorking = data.van_fridge_working || false;
    model.returnedVanProbe = data.returned_van_probe || false;
    model.cabCleaned = data.cab_cleaned || false;
    model.cabNotCleanedReason = data.cab_not_cleaned_reason || null;
    model.chemicalsUsed = data.chemicals_used || null;
    model.vanIssues = data.van_issues || null;
    model.repairsNeeded = data.repairs_needed || null;
    model.numberOfCratesIn = data.number_of_crates_in || null;
    model.needs_review = data.needs_review;
    
    return model;
  }
  
  // Helper method to convert camelCase form data to snake_case for server
  toServerFormat(): any {
    return {
      driver_name: this.driverName,
      date: this.date,
      time: this.time,
      van_registration: this.vanRegistration,
      starting_mileage: this.startingMileage,
      fuel_added: this.fuelAdded,
      litres_added: this.litresAdded,
      fuel_card_reg: this.fuelCardReg,
      full_uniform: this.fullUniform,
      all_site_keys: this.allSiteKeys,
      work_start_time: this.workStartTime,
      preload_van_temp: this.preloadVanTemp,
      preload_product_temp: this.preloadProductTemp,
      auxiliary_products: this.auxiliaryProducts,
      number_of_crates_out: this.numberOfCratesOut,
      van_probe_serial_number: this.vanProbeSerialNumber,
      paperwork_issues: this.paperworkIssues,
      paperwork_issues_reason: this.paperworkIssuesReason,
      orders_products_issues: this.ordersProductsIssues,
      orders_products_issues_reason: this.ordersProductsIssuesReason,
      site_issues: this.siteIssues,
      site_issues_reason: this.siteIssuesReason,
      customer_complaints: this.customerComplaints,
      customer_complaints_reason: this.customerComplaintsReason,
      product_complaints: this.productComplaints,
      product_complaints_reason: this.productComplaintsReason,
      closing_mileage: this.closingMileage,
      recycled_all_returns: this.recycledAllReturns,
      van_fridge_working: this.vanFridgeWorking,
      returned_van_probe: this.returnedVanProbe,
      cab_cleaned: this.cabCleaned,
      cab_not_cleaned_reason: this.cabNotCleanedReason,
      chemicals_used: this.chemicalsUsed,
      van_issues: this.vanIssues,
      repairs_needed: this.repairsNeeded,
      number_of_crates_in: this.numberOfCratesIn,
      needs_review: this.needs_review
    };
  }
} 