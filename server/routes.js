const { isValidChannelName } = require("./utils");

const router = require("express").Router();

// Route: Home page
router.get("/", (req, res) => res.render("index", { page: "index", title: "A free video chat for the web." }));

// Route: Auto join page
router.get("/join", (req, res) => {
	res.render("connect", { page: "channel", title: "Connect" });
});

// Route: Room page (dynamic)
router.get("/:channel", (req, res) => {
	const channel = req.params.channel;
	if (!isValidChannelName(channel)) {
		return res.status(400).render("invalid", { page: "invalid-channel", title: "Invalid channel" });
	}

	res.render("channel", { page: "channel", title: channel });
});

// Route: Catch-all for 404 errors
router.use(["/*", "/404"], (req, res) => res.status(404).render("404", { page: "404", title: "Page not found" }));

module.exports = router;
