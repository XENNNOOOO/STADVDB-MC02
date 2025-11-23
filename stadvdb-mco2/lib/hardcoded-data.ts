export interface HardcodedUser {
  id: number;
  name: string;
  email: string;
}

export interface HardcodedRider {
  id: number;
  name: string;
  vehicleType: string;
}

export interface HardcodedCourier {
  id: number;
  companyName: string;
  contactNumber: string;
}

export const HARDCODED_USERS: HardcodedUser[] = [
  { id: 1001, name: "John Smith", email: "john.smith@email.com" },
  { id: 1002, name: "Sarah Johnson", email: "sarah.johnson@email.com" },
  { id: 1003, name: "Michael Chen", email: "michael.chen@email.com" },
  { id: 1004, name: "Emily Rodriguez", email: "emily.rodriguez@email.com" },
  { id: 1005, name: "David Park", email: "david.park@email.com" }
];

export const HARDCODED_RIDERS: HardcodedRider[] = [
  { id: 2001, name: "Alex Thompson", vehicleType: "Motorcycle" },
  { id: 2002, name: "Maria Santos", vehicleType: "Bicycle" },
  { id: 2003, name: "James Wilson", vehicleType: "Scooter" },
  { id: 2004, name: "Lisa Chang", vehicleType: "Motorcycle" },
  { id: 2005, name: "Robert Garcia", vehicleType: "Van" }
];

export const HARDCODED_COURIERS: HardcodedCourier[] = [
  { id: 3001, companyName: "FastTrack Delivery", contactNumber: "+1-555-0123" },
  { id: 3002, companyName: "QuickShip Express", contactNumber: "+1-555-0124" },
  { id: 3003, companyName: "SpeedyPost Services", contactNumber: "+1-555-0125" },
  { id: 3004, companyName: "RapidGo Logistics", contactNumber: "+1-555-0126" },
  { id: 3005, companyName: "ZoomDelivery Co.", contactNumber: "+1-555-0127" }
];

export const getRandomUser = (): HardcodedUser => {
  const randomIndex = Math.floor(Math.random() * HARDCODED_USERS.length);
  return HARDCODED_USERS[randomIndex];
};

export const getRandomRider = (): HardcodedRider => {
  const randomIndex = Math.floor(Math.random() * HARDCODED_RIDERS.length);
  return HARDCODED_RIDERS[randomIndex];
};

export const getRandomCourier = (): HardcodedCourier => {
  const randomIndex = Math.floor(Math.random() * HARDCODED_COURIERS.length);
  return HARDCODED_COURIERS[randomIndex];
};

export const getUserByYear = (year: '2024' | '2025'): HardcodedUser => {
  if (year === '2024') {
    return HARDCODED_USERS[0] || HARDCODED_USERS[0];
  } else {
    return HARDCODED_USERS[1] || HARDCODED_USERS[0];
  }
};

export const getRiderByYear = (year: '2024' | '2025'): HardcodedRider => {
  if (year === '2024') {
    return HARDCODED_RIDERS[0] || HARDCODED_RIDERS[0];
  } else {
    return HARDCODED_RIDERS[1] || HARDCODED_RIDERS[0];
  }
};

export const getCourierByYear = (year: '2024' | '2025'): HardcodedCourier => {
  if (year === '2024') {
    return HARDCODED_COURIERS[0] || HARDCODED_COURIERS[0];
  } else {
    return HARDCODED_COURIERS[1] || HARDCODED_COURIERS[0];
  }
};