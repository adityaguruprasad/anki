const API_ROUTE_NOT_FOUND_ERROR = 'API route not found';

function handleApiNotFound(req, res) {
  return res.status(404).json({ error: API_ROUTE_NOT_FOUND_ERROR });
}

module.exports = {
  API_ROUTE_NOT_FOUND_ERROR,
  handleApiNotFound,
};
