export interface Driver {
  id: string;
  custom_id: string;
  name: string;
  role: string;
  location:string;
  phone_number?: string;
  password?: string;
  created_at: string;
  selected?: boolean; // For UI selection state
} 