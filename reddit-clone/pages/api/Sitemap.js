export default function handler(req, res) {
    const data = [
      {
        "id": 1
      },
      {
        "id": 2
      }
    ];
  
    res.status(200).json(data);
  }
  
  