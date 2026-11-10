import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    app: "D1 Hoops Analytics",
    status: "online",
    season: 2027,
    providers: {
      collegeBasketballData: process.env.CBBD_API_KEY ? "configured_not_yet_schema-validated" : "not_configured",
      sportsDataIO: process.env.SPORTSDATAIO_API_KEY ? "configured_adapter_pending" : "not_configured",
      apiNinjas: process.env.API_NINJAS_KEY ? "configured_adapter_pending" : "not_configured"
    },
    note: "Sample dashboard fixtures are not live statistics."
  });
}
