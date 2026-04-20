import { useState, useEffect } from 'react';

const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
};

export function useDropdowns() {
  const [departments, setDepartments] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);   // ← phải có dòng này

  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(toArray(d)))
      .catch(() => {});

    fetch('/api/device-types')
      .then((r) => r.json())
      .then((d) => setDeviceTypes(toArray(d)))
      .catch(() => {});
  }, []);

  return { departments, deviceTypes };  // ← phải return cả 2
}