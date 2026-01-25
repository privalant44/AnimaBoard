const boondManagerService = require('./boondManagerService');
const pennylaneService = require('./pennylaneService');
const { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval } = require('date-fns');

class DashboardService {
  /**
   * Récupère toutes les métriques du tableau de bord
   */
  async getDashboardMetrics(startDate, endDate) {
    try {
      const start = startDate ? parseISO(startDate) : new Date(new Date().getFullYear(), 0, 1);
      const end = endDate ? parseISO(endDate) : new Date();

      console.log('📥 Récupération des données depuis les API...');
      
      // Récupérer les données
      const [resources, timeEntries, invoices, expenses, salaries] = await Promise.all([
        boondManagerService.getResources(),
        boondManagerService.getTimeEntries(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        pennylaneService.getInvoices(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        pennylaneService.getExpenses(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        pennylaneService.getSalaries(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'))
      ]);

      // Normaliser les données (gérer différents formats de réponse)
      const resourcesData = Array.isArray(resources) ? resources : (resources?.data || []);
      const timeEntriesData = Array.isArray(timeEntries) ? timeEntries : (timeEntries?.data || []);
      const invoicesData = Array.isArray(invoices) ? invoices : (invoices?.data || []);
      const expensesData = Array.isArray(expenses) ? expenses : (expenses?.data || []);
      const salariesData = Array.isArray(salaries) ? salaries : (salaries?.data || []);

      // Vérifier que les données sont des tableaux
      if (!Array.isArray(resourcesData)) {
        throw new Error(`Format de données invalide pour resources: ${typeof resourcesData}`);
      }
      if (!Array.isArray(timeEntriesData)) {
        throw new Error(`Format de données invalide pour timeEntries: ${typeof timeEntriesData}`);
      }
      if (!Array.isArray(invoicesData)) {
        throw new Error(`Format de données invalide pour invoices: ${typeof invoicesData}`);
      }
      if (!Array.isArray(expensesData)) {
        throw new Error(`Format de données invalide pour expenses: ${typeof expensesData}`);
      }
      if (!Array.isArray(salariesData)) {
        throw new Error(`Format de données invalide pour salaries: ${typeof salariesData}`);
      }

      console.log(`✅ Données récupérées: ${resourcesData.length} ressources, ${timeEntriesData.length} temps, ${invoicesData.length} factures, ${expensesData.length} charges, ${salariesData.length} salaires`);

      // Calculer les métriques par mois
      const months = eachMonthOfInterval({ start, end });
      console.log(`📅 Calcul des métriques pour ${months.length} mois...`);
      
      const monthlyMetrics = months.map(month => {
        return this.calculateMonthlyMetrics(
          month,
          resourcesData,
          timeEntriesData,
          invoicesData,
          expensesData,
          salariesData
        );
      });

      // Calculer les totaux
      const totals = this.calculateTotals(monthlyMetrics);

      console.log('✅ Métriques calculées avec succès');
      
      return {
        monthly: monthlyMetrics,
        totals
      };
    } catch (error) {
      console.error('❌ Erreur dans getDashboardMetrics:', error);
      throw error;
    }
  }

  /**
   * Calcule les métriques pour un mois donné
   */
  calculateMonthlyMetrics(month, resources, timeEntries, invoices, expenses, salaries) {
    const monthStr = format(month, 'yyyy-MM');
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    // Chiffre d'affaires (factures du mois)
    const monthInvoices = invoices.filter(inv => {
      try {
        const dateStr = inv.date || inv.invoice_date || inv.created_at;
        if (!dateStr) return false;
        const invDate = parseISO(dateStr);
        if (isNaN(invDate.getTime())) return false;
        return invDate >= monthStart && invDate <= monthEnd && 
               (inv.status === 'paid' || inv.status === 'sent');
      } catch (e) {
        return false;
      }
    });
    const revenue = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);

    // Coût des ressources facturables
    const billableResources = resources.filter(r => r.billable !== false);
    const billableTimeEntries = timeEntries.filter(te => {
      try {
        const dateStr = te.date || te.created_at;
        if (!dateStr) return false;
        const teDate = parseISO(dateStr);
        if (isNaN(teDate.getTime())) return false;
        const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
        return teDate >= monthStart && teDate <= monthEnd && 
               resource && resource.billable !== false;
      } catch (e) {
        return false;
      }
    });
    const billableCost = billableTimeEntries.reduce((sum, te) => {
      const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
      const hourlyRate = resource?.hourlyRate || resource?.hourly_rate || 0;
      const hours = parseFloat(te.hours) || 0;
      return sum + (hourlyRate * hours);
    }, 0);

    // Coût des ressources non facturables
    const nonBillableResources = resources.filter(r => r.billable === false);
    const nonBillableTimeEntries = timeEntries.filter(te => {
      try {
        const dateStr = te.date || te.created_at;
        if (!dateStr) return false;
        const teDate = parseISO(dateStr);
        if (isNaN(teDate.getTime())) return false;
        const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
        return teDate >= monthStart && teDate <= monthEnd && 
               resource && resource.billable === false;
      } catch (e) {
        return false;
      }
    });
    const nonBillableCost = nonBillableTimeEntries.reduce((sum, te) => {
      const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
      const hourlyRate = resource?.hourlyRate || resource?.hourly_rate || 0;
      const hours = parseFloat(te.hours) || 0;
      return sum + (hourlyRate * hours);
    }, 0);

    // Charges (frais + salaires)
    const monthExpenses = expenses.filter(exp => {
      try {
        const dateStr = exp.date || exp.expense_date || exp.created_at;
        if (!dateStr) return false;
        const expDate = parseISO(dateStr);
        if (isNaN(expDate.getTime())) return false;
        return expDate >= monthStart && expDate <= monthEnd;
      } catch (e) {
        return false;
      }
    });
    const expensesAmount = monthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);

    const monthSalaries = salaries.filter(sal => {
      try {
        const dateStr = sal.date || sal.salary_date || sal.created_at;
        if (!dateStr) return false;
        const salDate = parseISO(dateStr);
        if (isNaN(salDate.getTime())) return false;
        return salDate >= monthStart && salDate <= monthEnd;
      } catch (e) {
        return false;
      }
    });
    const salariesAmount = monthSalaries.reduce((sum, sal) => sum + (parseFloat(sal.amount) || 0), 0);

    const totalCharges = expensesAmount + salariesAmount;

    // TACE (Taux d'Activité Coût d'Emploi) = (CA / Coût total des ressources) * 100
    const totalResourceCost = billableCost + nonBillableCost;
    const tace = totalResourceCost > 0 ? (revenue / totalResourceCost) * 100 : 0;

    // TACI (Taux d'Activité Coût d'Intervention) = (CA / Coût ressources facturables) * 100
    const taci = billableCost > 0 ? (revenue / billableCost) * 100 : 0;

    // EBE (Excédent Brut d'Exploitation) = CA - Coût des ressources facturables - Charges
    const ebe = revenue - billableCost - totalCharges;

    // REX (Résultat d'Exploitation) = CA - Coût total des ressources - Charges
    const rex = revenue - totalResourceCost - totalCharges;

    return {
      month: monthStr,
      revenue,
      billableCost,
      nonBillableCost,
      charges: totalCharges,
      tace: parseFloat(tace.toFixed(2)),
      taci: parseFloat(taci.toFixed(2)),
      ebe: parseFloat(ebe.toFixed(2)),
      rex: parseFloat(rex.toFixed(2))
    };
  }

  /**
   * Calcule les totaux sur toutes les périodes
   */
  calculateTotals(monthlyMetrics) {
    return monthlyMetrics.reduce((acc, month) => ({
      revenue: acc.revenue + month.revenue,
      billableCost: acc.billableCost + month.billableCost,
      nonBillableCost: acc.nonBillableCost + month.nonBillableCost,
      charges: acc.charges + month.charges,
      ebe: acc.ebe + month.ebe,
      rex: acc.rex + month.rex
    }), {
      revenue: 0,
      billableCost: 0,
      nonBillableCost: 0,
      charges: 0,
      ebe: 0,
      rex: 0
    });
  }

  /**
   * Récupère le CA par mois
   */
  async getRevenueByMonth(startDate, endDate) {
    const metrics = await this.getDashboardMetrics(startDate, endDate);
    return metrics.monthly.map(m => ({
      month: m.month,
      revenue: m.revenue
    }));
  }
}

module.exports = new DashboardService();
