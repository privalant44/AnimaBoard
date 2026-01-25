const axios = require('axios');

class PennylaneService {
  constructor() {
    this.baseURL = process.env.PENNYLANE_API_URL || 'https://api.pennylane.io';
    this.apiKey = process.env.PENNYLANE_API_KEY;
    
    if (!this.apiKey) {
      console.warn('⚠️  Pennylane API key not configured');
    }
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        params,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error calling Pennylane API ${endpoint}:`, error.message);
      // En mode développement, retourner des données mockées
      if (process.env.NODE_ENV === 'development') {
        return this.getMockData(endpoint);
      }
      throw error;
    }
  }

  async getInvoices(startDate, endDate) {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.makeRequest('/v1/invoices', params);
  }

  async getExpenses(startDate, endDate) {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.makeRequest('/v1/expenses', params);
  }

  async getSalaries(startDate, endDate) {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.makeRequest('/v1/salaries', params);
  }

  // Données mockées pour le développement
  getMockData(endpoint) {
    if (endpoint.includes('invoices')) {
      return {
        data: [
          { id: 1, amount: 5000, date: '2024-01-15', status: 'paid' },
          { id: 2, amount: 3000, date: '2024-01-20', status: 'paid' },
          { id: 3, amount: 4000, date: '2024-02-10', status: 'pending' }
        ]
      };
    }
    if (endpoint.includes('expenses')) {
      return {
        data: [
          { id: 1, amount: 500, date: '2024-01-10', category: 'frais' },
          { id: 2, amount: 300, date: '2024-01-15', category: 'frais' }
        ]
      };
    }
    if (endpoint.includes('salaries')) {
      return {
        data: [
          { id: 1, amount: 3000, date: '2024-01-31', employee: 'Jean Dupont' },
          { id: 2, amount: 2800, date: '2024-01-31', employee: 'Marie Martin' }
        ]
      };
    }
    return { data: [] };
  }
}

module.exports = new PennylaneService();
