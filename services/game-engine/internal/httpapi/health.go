package httpapi

import "net/http"

type healthResponse struct {
	Status string `json:"status"`
}

func health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only GET is supported for this endpoint.")
		return
	}

	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}
