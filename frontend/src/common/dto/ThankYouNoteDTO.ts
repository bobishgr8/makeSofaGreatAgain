// GET /api/thank-you-notes and POST /api/furniture/:id/thank-you (backend/app/thanks.py).
export type ThankYouNote = {
  id: string;
  furnitureId: string;
  itemTitle?: string;
  category?: string;
  organisation?: string;
  message: string;
  createdAt?: string;
};
