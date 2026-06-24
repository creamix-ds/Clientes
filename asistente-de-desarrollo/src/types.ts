export interface Appointment {
  id: string; // Google Calendar Event ID
  patientName: string;
  contactNumber: string;
  serviceType: "Kinesiología" | "Fisioterapia" | "Spa";
  start: string; // ISO string
  end: string; // ISO string
  notes?: string;
  htmlLink?: string;
}

export interface TimeSlot {
  time: string; // "HH:MM"
  datetimeStart: Date;
  datetimeEnd: Date;
  available: boolean;
  appointment?: Appointment;
}

export interface ServiceTypeInfo {
  name: "Kinesiología" | "Fisioterapia" | "Spa";
  iconName: string;
  color: string;
  description: string;
  textColor: string;
  borderColor: string;
  bgColor: string;
  badgeBg: string;
}
