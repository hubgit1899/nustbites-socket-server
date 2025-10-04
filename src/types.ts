// types/socket.ts
export interface LocationPayload {
  lat: number;
  lng: number;
}

type GeoLocation = {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
};
export enum OrderStatus {
  PENDING = "PENDING",
  PLACED = "PLACED",
  ACCEPTED = "ACCEPTED",
  READY = "READY", // order ready at restaurant
  EN_ROUTE_A = "EN ROUTE A", // Rider on the way to restaurant
  PICKED_UP = "PICKED UP",
  EN_ROUTE_B = "EN ROUTE B", // Rider on the way to customer
  REACHED_B = "REACHED B",
  DELIVERED = "DELIVERED",
  CANCELED = "CANCELED",
}

export enum OrderPaymentStatus {
  PAID_VERIFIED = "PAID_VERIFIED",
  PAID_UNVERIFIED = "PAID_UNVERIFIED",
  UNPAID = "UNPAID",
  REFUNDED = "REFUNDED",
}

interface Item {
  menuItemId: any;
  menuItem?: any; // Added for database compatibility
  name: string;
  basePrice: number;
  imageURL: string;
  category: string;
  options?: {
    optionHeader: string;
    selected: string;
    additionalPrice: number;
  }[];
  quantity: number;
  restaurant?: any;
}

interface OrderPayment {
  amount: number;
  status: OrderPaymentStatus;
  slipURL: string;
  platformAccount: bankAccount;
  transaction: any;
}

interface bankAccount {
  accountNumber: string;
  accountTitle: string;

  bankName: string;
}

interface PlatformFee {
  type: "PERCENTAGE" | "FIXED";
  value: number; // e.g., 5 for 5% or Rs. 5
}

export interface OrderData {
  _id: string;
  orderId: string;
  status: OrderStatus;
  orderAmount: number;
  deliveryFee: number;
  items: Item[];
  pickupLocation: GeoLocation;
  dropoffLocation: GeoLocation;
  createdAt: string;
  updatedAt?: string;
  restaurantOrderId?: string; // Add this field for restaurant order ID
  restaurant: {
    _id: string;
    name: string;
    accentColor?: string;
    phoneNumber?: string;
    platformFee: PlatformFee;
    owner?: {
      _id: string;
      username: string;
      email: string;
      fullName?: string;
    };
    admin?: string[];
  };
  customer: {
    _id: string;
    username: string;
    fullName?: string;
    email: string | undefined;
    phoneNumber: string | undefined;
  };
  rider?: {
    _id: string;
    username?: string;
    fullName?: string;
    email?: string;
    phoneNumber?: string;
    platformFee: PlatformFee;
  };
  payment: OrderPayment | undefined;
  specialInstructions?: string;
  distance: number;
}

// Events emitted from the Server to the Client
export interface ServerToClientEvents {
  new_order: (order: OrderData) => void;
  order_accepted: (payload: { orderId: string }) => void;
  order_status_updated: (payload: { orderId: string; status: string }) => void;
  rider_location_update: (payload: LocationPayload) => void;
}

// Events emitted from the Client to the Server
export interface ClientToServerEvents {
  join_orders_feed: () => void;
  leave_orders_feed: () => void;
  authenticate_rider: (riderId: string) => void;
  join_order_room: (orderId: string) => void;
  rider_sends_batch_location: (payload: {
    orderIds: string[];
    location: LocationPayload;
  }) => void;
}

// 👇 NEW: Interface for server-to-server events (can be empty if not used)
export interface InterServerEvents {}

// 👇 NEW: Interface for custom data attached to each socket instance
export interface SocketData {
  riderId: string;
}
