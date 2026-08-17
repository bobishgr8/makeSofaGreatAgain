export type DonorProfile = {
  id: string;
  displayName?: string;
  phone?: string;
  preferredContactMethod?: string;

  consent?: {
    contactAllowed?: boolean;
  };

  updatedAt?: string;
};