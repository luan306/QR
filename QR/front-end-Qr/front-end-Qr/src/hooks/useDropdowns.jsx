import { useState, useEffect } from 'react';
import api from '../utils/api';

export function useDropdowns() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/api/departments');
        if (res?.ok) {
          const data = await res.json();
          setDepartments(data);
        }
      } catch (err) {
        console.error('useDropdowns error:', err);
      }
      setLoading(false);
    };
    fetchDepartments();
  }, []);

  return { departments, loading };
}