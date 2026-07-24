import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { clearCatalogCache } from '../../utils/cache';

import dashboard from './dashboard';
import categories from './categories';
import products from './products';
import variations from './variations';
import vouchers from './vouchers';
import autoVouchers from './autoVouchers';
import combos from './combos';
import orders from './orders';
import users from './users';
import deposits from './deposits';
import transactions from './transactions';
import shells from './shells';
import sliders from './sliders';
import pages from './pages';
import settings from './settings';
import pool from './pool';
import userPrices from './userPrices';
import creator from './creator';
import broadcast from './broadcast';

const router = Router();

// Every admin route requires an authenticated admin.
router.use(requireAdmin);

// After any successful catalog mutation, bust the public products/sliders cache.
function bustCatalogCache(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) clearCatalogCache();
    });
  }
  next();
}

router.use('/dashboard', dashboard);
router.use('/categories', bustCatalogCache, categories);
router.use('/products', bustCatalogCache, products);
router.use('/variations', bustCatalogCache, variations);
router.use('/vouchers', bustCatalogCache, vouchers);
router.use('/auto-vouchers', bustCatalogCache, autoVouchers);
router.use('/combos', bustCatalogCache, combos);
router.use('/orders', orders);
router.use('/users', users);
router.use('/deposits', deposits);
router.use('/transactions', transactions);
router.use('/shells', shells);
router.use('/sliders', bustCatalogCache, sliders);
router.use('/pages', pages);
router.use('/settings', settings);
// UC পুল, রেসিপি ও পার-ইউজার দাম — ক্যাটালগ বদলায় তাই ক্যাশ বাস্ট
router.use('/pool', bustCatalogCache, pool);
router.use('/user-prices', bustCatalogCache, userPrices);
router.use('/creator', creator);
router.use('/broadcast', broadcast);

export default router;
