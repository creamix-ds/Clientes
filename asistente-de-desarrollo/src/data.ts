import { ServiceTypeInfo } from "./types";

export const SERVICE_TYPES: ServiceTypeInfo[] = [
  {
    name: "Kinesiología",
    iconName: "Activity",
    color: "emerald",
    description: "Rehabilitación motriz, traumatológica, respiratoria y neurológica para recuperar la movilidad corporal.",
    textColor: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-200 dark:border-emerald-800/50",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
    badgeBg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
  },
  {
    name: "Fisioterapia",
    iconName: "Zap",
    color: "indigo",
    description: "Tratamiento del dolor y regeneración muscular mediante agentes físicos (magneto, ultrasonido, láser).",
    textColor: "text-indigo-700 dark:text-indigo-300",
    borderColor: "border-indigo-200 dark:border-indigo-800/50",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/20",
    badgeBg: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
  },
  {
    name: "Spa",
    iconName: "Sparkles",
    color: "teal",
    description: "Masajes relajantes, descontracturantes, piedras calientes y terapias de bienestar holístico.",
    textColor: "text-teal-700 dark:text-teal-300",
    borderColor: "border-teal-200 dark:border-teal-800/50",
    bgColor: "bg-teal-50 dark:bg-teal-950/20",
    badgeBg: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300"
  }
];

export const WORKING_HOURS = {
  start: 8, // 08:00 AM
  end: 20   // 08:00 PM
};
