export async function loginUser(identifier: string, password: string) {

  const res = await fetch("http://localhost:8001/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      identifier,
      password
    })
  });

  if (!res.ok) return null;

  return res.json();
}