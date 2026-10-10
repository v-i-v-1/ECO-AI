export const SDG_GOALS = [
  { id: 1, title: "No Poverty", focus: "Affordable, resilient housing and essential services", indicators: "Housing affordability, service access", status: "unavailable", data: "Local housing costs and household data" },
  { id: 2, title: "Zero Hunger", focus: "Food access and resilient urban food systems", indicators: "Food access, urban agriculture", status: "unavailable", data: "Food locations, access, and food-system data" },
  { id: 3, title: "Good Health and Well-being", focus: "Healthy environments and access to care", indicators: "Air quality, heat exposure, green access", status: "unavailable", data: "Local air quality, health access, and population data" },
  { id: 4, title: "Quality Education", focus: "Access to schools and safe routes", indicators: "School access, travel distance", status: "unavailable", data: "School locations and population by age" },
  { id: 5, title: "Gender Equality", focus: "Safe and equitable access to city services", indicators: "Access and safety by gender", status: "unavailable", data: "Responsible, locally collected, disaggregated data" },
  { id: 6, title: "Clean Water and Sanitation", focus: "Water use, reuse, and service access", indicators: "Estimated demand, reuse, sanitation access", status: "prototype", data: "Measured local water use and service coverage" },
  { id: 7, title: "Affordable and Clean Energy", focus: "Building demand and renewable energy", indicators: "Historical energy forecast, scenario generation", status: "partial", data: "BDG2 meter data; local grid and renewable data needed" },
  { id: 8, title: "Decent Work and Economic Growth", focus: "Access to jobs and resilient local activity", indicators: "Job access, economic opportunity", status: "unavailable", data: "Local employment, transport, and economic data" },
  { id: 9, title: "Industry, Innovation and Infrastructure", focus: "Resilient infrastructure and clean technology", indicators: "Infrastructure access and reliability", status: "prototype", data: "Asset, access, and service reliability records" },
  { id: 10, title: "Reduced Inequalities", focus: "Fair access across population groups", indicators: "Service access by group", status: "unavailable", data: "Local demographic and service-access data" },
  { id: 11, title: "Sustainable Cities and Communities", focus: "Housing, land use, green space, and resilience", indicators: "Land use, green cover, planned infrastructure", status: "partial", data: "Validated local buildings, hazards, and service data" },
  { id: 12, title: "Responsible Consumption and Production", focus: "Efficient use of energy, water, and materials", indicators: "Estimated energy, water, and waste", status: "prototype", data: "Measured water, waste, and material flows" },
  { id: 13, title: "Climate Action", focus: "Emissions and climate resilience", indicators: "Estimated electricity emissions and weather scenarios", status: "prototype", data: "Local grid factors and climate hazard data" },
  { id: 14, title: "Life Below Water", focus: "Urban effects on rivers, coasts, and aquatic systems", indicators: "Water quality, runoff, coastal exposure", status: "unavailable", data: "Watersheds, discharge, and water-quality data" },
  { id: 15, title: "Life on Land", focus: "Land cover, vegetation, and habitat", indicators: "Land-cover classes and green-space estimates", status: "partial", data: "Downloaded WorldCover tiles; spatial processing pending" },
  { id: 16, title: "Peace, Justice and Strong Institutions", focus: "Transparent and inclusive planning", indicators: "Participation and fair public services", status: "unavailable", data: "Governance and public-participation data" },
  { id: 17, title: "Partnerships for the Goals", focus: "Open, traceable data and collaboration", indicators: "Source records, licenses, and data coverage", status: "prototype", data: "Complete dataset provenance and partner records" },
];

export const SDG_STATUS_LABELS = {
  partial: "Partial data",
  prototype: "Prototype estimate",
  unavailable: "Data needed",
};
