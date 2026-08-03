/** Credit sales are dormant. Ledger and grant infrastructure remain intact. */
import { apiError, withApiHandler } from '../../_lib/http';

export const POST = withApiHandler(async () =>
  apiError(404, 'CREDITS_DISABLED', 'Credit purchases are not available.'),
);
