"use client"

import type React from "react"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { useLocation } from "wouter"
import { apiRequest, queryClient } from "@/lib/queryClient"
import { Heart, Edit, Trash2, Sparkles, CheckCircle2, ArrowUpRight, Share2, Package, Box, Tag, Info, Calendar, Boxes, TrendingUp, BarChart, PackageOpen, ImageIcon } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import ConvertWatchlistDialog from "./convert-watchlist-dialog"

interface ProductCardProps {
  product: {
    id: number
    name: string
    description: string | null
    price: string | null
    imageUrl?: string
    condition?: string
    sku?: string
    brand?: string
    category?: string
    quantity: number
    createdAt: string
    weight?: number
    dimensions?: string
    ebayPrice?: string
    ebayListingUrl?: string
    aiAnalysis?: string
  }
  onEdit: (product: any) => void
  inWatchlist?: boolean
  view?: "grid" | "list" | "table"
  watchlistId?: number
}

const DEFAULT_AI_ANALYSIS = {
  category: "Uncategorized",
  marketAnalysis: {
    demandScore: 0,
    competitionLevel: "Unknown",
    priceSuggestion: { min: 0, max: 0 },
  },
  suggestions: ["No analysis available"],
  seoKeywords: [],
  ebayData: undefined,
}

function ProductCard({ product, onEdit, inWatchlist = false, view = "grid", watchlistId }: ProductCardProps) {
  const { toast } = useToast()
  const [, setLocation] = useLocation()
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [isGeneratingListing, setIsGeneratingListing] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [activeTab, setActiveTab] = useState("details")

  const parseAIAnalysis = (data: unknown) => {
    try {
      if (typeof data === "string") {
        return JSON.parse(data)
      } else if (data && typeof data === "object") {
        return data
      }
      return DEFAULT_AI_ANALYSIS
    } catch (e) {
      console.error("Failed to parse aiAnalysis:", e)
      return DEFAULT_AI_ANALYSIS
    }
  }

  const aiAnalysis = parseAIAnalysis(product.aiAnalysis)
  const hasAnalysis = aiAnalysis !== DEFAULT_AI_ANALYSIS
  const currentPrice = Number(product.price) || 0
  const isUnderpriced = hasAnalysis && currentPrice < (aiAnalysis.marketAnalysis.priceSuggestion.min ?? 0)
  const isOverpriced = hasAnalysis && currentPrice > (aiAnalysis.marketAnalysis.priceSuggestion.max ?? 0)
  const isPricedRight = hasAnalysis && !isUnderpriced && !isOverpriced

  const getImageUrl = (url?: string) => {
    if (!url) return undefined
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    if (url.startsWith("/uploads/")) return url
    return `/uploads/${url.replace(/^\/+/, "")}`
  }

  const handleAction = async (action: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      let response, result
      switch (action) {
        case "markAsSold":
          response = await apiRequest("POST", "/api/orders", { productId: product.id })
          result = await response.json()
          if (result.error) throw new Error(result.error)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
          ])
          toast({ title: "Product marked as sold", description: product.name })
          setLocation("/orders")
          break
        case "toggleWatchlist":
          if (inWatchlist && window.location.pathname.includes("/watchlist")) return
          if (inWatchlist) {
            response = await apiRequest("DELETE", `/api/watchlist/${watchlistId || product.id}`)
          } else {
            response = await apiRequest("POST", "/api/watchlist", { productId: product.id })
          }
          result = await response.json()
          if (result.error) throw new Error(result.error)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
          ])
          toast({
            title: inWatchlist ? "Removed from watchlist" : "Added to watchlist",
            description: product.name,
          })
          break
        case "deleteProduct":
          response = await apiRequest("DELETE", `/api/products/${product.id}`)
          result = await response.json()
          if (result.error) throw new Error(result.error)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
          ])
          toast({ title: "Product deleted", description: product.name })
          break
        case "generateEbayListing":
          setIsGeneratingListing(true)
          response = await apiRequest("POST", `/api/products/${product.id}/generate-ebay-listing`)
          result = await response.json()
          if (result.error) {
            if (response.status === 403 && result.error === "eBay authentication required") {
              toast({
                title: "eBay Authentication Required",
                description: "You need to connect your eBay account first.",
                variant: "default",
                action: (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.location.href = "/settings/ebay-auth"
                    }}
                  >
                    Connect eBay
                  </Button>
                ),
              })
              return
            }
            throw new Error(result.error)
          }
          await queryClient.invalidateQueries({ queryKey: ["/api/products"] })
          toast({
            title: "eBay listing generated",
            description: "Your product has been listed on eBay",
          })
          if (result.ebayListingUrl) {
            window.open(result.ebayListingUrl, "_blank")
          }
          break
      }
    } catch (error) {
      console.error(`Error during ${action}:`, error)
      toast({
        title: "Error",
        description: `Failed to ${action.replace(/([A-Z])/g, " $1").toLowerCase()}`,
        variant: "destructive",
      })
    } finally {
      if (action === "generateEbayListing") setIsGeneratingListing(false)
    }
  }

  return (
    <>
      <Card className="overflow-hidden flex flex-col">
        {/* Image Section */}
        <div className="relative aspect-[16/9] bg-secondary/20">
          {product.imageUrl && !imageError ? (
            <img
              src={getImageUrl(product.imageUrl)}
              alt={`Image of ${product.name}`}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 bg-background/80 backdrop-blur-sm hover:bg-background/90"
              onClick={(e) => handleAction("toggleWatchlist", e)}
            >
              <Heart className="h-5 w-5" fill={inWatchlist ? "currentColor" : "none"} />
            </Button>
            {hasAnalysis && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-9 w-9 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                  >
                    <Sparkles className="h-5 w-5 text-primary" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" side="left">
                  <ScrollArea className="h-[500px]">
                    <div className="p-6 space-y-6">
                      {/* Market Analysis Header */}
                      <div className="flex items-center justify-between border-b pb-4 sticky top-0 bg-background z-10">
                        <h4 className="font-medium text-lg">Market Analysis</h4>
                        <span className="text-sm text-muted-foreground">{aiAnalysis.category}</span>
                      </div>

                      {/* Demand Score */}
                      <div className="space-y-6">
                        <div className="p-4 rounded-lg bg-secondary/10 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Market Demand</span>
                            <span className="text-sm font-medium">{aiAnalysis.marketAnalysis.demandScore}/100</span>
                          </div>
                          <Progress value={aiAnalysis.marketAnalysis.demandScore} className="h-2" />
                          <div className="flex items-center gap-2">
                            <BarChart className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Competition: {aiAnalysis.marketAnalysis.competitionLevel}</span>
                          </div>
                        </div>

                        {/* eBay Market Data */}
                        {aiAnalysis.ebayData && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <PackageOpen className="h-4 w-4" />
                              <h5 className="font-medium">eBay Market Data</h5>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-4 rounded-lg bg-secondary/10">
                                <div className="text-sm text-muted-foreground">Sales Volume</div>
                                <div className="mt-2 text-lg font-semibold">{aiAnalysis.ebayData.soldCount}</div>
                              </div>
                              <div className="p-4 rounded-lg bg-secondary/10">
                                <div className="text-sm text-muted-foreground">Active Listings</div>
                                <div className="mt-2 text-lg font-semibold">{aiAnalysis.ebayData.activeListing}</div>
                              </div>
                            </div>
                            <div className="p-4 rounded-lg bg-secondary/10 space-y-3">
                              <div className="flex justify-between text-sm">
                                <span>Average Price</span>
                                <span className="font-medium">${aiAnalysis.ebayData.averagePrice}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Price Range</span>
                                <span className="font-medium">
                                  ${aiAnalysis.ebayData.lowestPrice} - ${aiAnalysis.ebayData.highestPrice}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Optimization Tips */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            <h5 className="font-medium">Optimization Tips</h5>
                          </div>
                          <ul className="space-y-3">
                            {aiAnalysis.suggestions.map((suggestion, index) => (
                              <li
                                key={index}
                                className="text-sm text-muted-foreground pl-4 border-l-2 border-primary/20"
                              >
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 pt-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details" className="py-2.5">Details</TabsTrigger>
                <TabsTrigger value="pricing" className="py-2.5">Pricing</TabsTrigger>
                <TabsTrigger value="metrics" className="py-2.5">Metrics</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 mt-6">
              <ScrollArea className="h-full">
                <div className="px-6 pb-6">
                  <TabsContent value="details" className="m-0">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-2xl font-semibold mb-3">{product.name}</h3>
                        <p className="text-muted-foreground text-base leading-relaxed">{product.description}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Package className="h-5 w-5 text-primary" />
                            <span className="font-medium min-w-[80px]">SKU:</span>
                            <span>{product.sku || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Box className="h-5 w-5 text-primary" />
                            <span className="font-medium min-w-[80px]">Brand:</span>
                            <span>{product.brand || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Tag className="h-5 w-5 text-primary" />
                            <span className="font-medium min-w-[80px]">Category:</span>
                            <span>{product.category || "N/A"}</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Info className="h-5 w-5 text-primary" />
                            <span className="font-medium min-w-[80px]">Condition:</span>
                            <span className="capitalize">
                              {(product.condition || "").replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Boxes className="h-5 w-5 text-primary" />
                            <span className="font-medium min-w-[80px]">Quantity:</span>
                            <span>{product.quantity}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-primary" />
                            <span className="font-medium min-w-[80px]">Added:</span>
                            <span>{format(new Date(product.createdAt), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                      </div>

                      {(product.weight || product.dimensions) && (
                        <div className="pt-6 mt-6 border-t">
                          <h4 className="text-sm font-medium mb-4">Specifications</h4>
                          <div className="grid grid-cols-2 gap-4">
                            {product.weight && (
                              <div className="flex items-center gap-3">
                                <span className="font-medium min-w-[80px]">Weight:</span>
                                <span>{product.weight} lbs</span>
                              </div>
                            )}
                            {product.dimensions && (
                              <div className="flex items-center gap-3">
                                <span className="font-medium min-w-[80px]">Dimensions:</span>
                                <span>{product.dimensions}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="pricing" className="m-0">
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 rounded-lg bg-secondary/10">
                          <div className="text-sm text-muted-foreground mb-2">List Price</div>
                          <div className="text-3xl font-semibold text-primary">
                            ${Number(product.price).toFixed(2)}
                          </div>
                        </div>

                        {product.ebayPrice && (
                          <div className="p-6 rounded-lg bg-secondary/10">
                            <div className="text-sm text-muted-foreground mb-2">eBay Price</div>
                            <div className="text-3xl font-semibold">
                              ${Number(product.ebayPrice).toFixed(2)}
                            </div>
                          </div>
                        )}
                      </div>

                      {hasAnalysis && aiAnalysis?.marketAnalysis?.priceSuggestion && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium">Price Analysis</h4>
                          <div className="p-6 rounded-lg bg-secondary/10 space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-sm">Current Price</span>
                              <span className={cn(
                                "text-lg font-semibold",
                                isUnderpriced && "text-yellow-600",
                                isOverpriced && "text-red-600",
                                isPricedRight && "text-green-600"
                              )}>
                                ${currentPrice}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm">Suggested Range</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-lg font-semibold">
                                  ${aiAnalysis.marketAnalysis.priceSuggestion.min}
                                </span>
                                <span className="text-sm text-muted-foreground">to</span>
                                <span className="text-lg font-semibold">
                                  ${aiAnalysis.marketAnalysis.priceSuggestion.max}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="metrics" className="m-0">
                    <div className="space-y-6">
                      {hasAnalysis && (
                        <>
                          <div className="space-y-4">
                            <h4 className="text-sm font-medium">Market Performance</h4>
                            <div className="p-6 rounded-lg bg-secondary/10 space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Demand Score</span>
                                <span className="text-lg font-semibold">
                                  {aiAnalysis.marketAnalysis.demandScore}/100
                                </span>
                              </div>
                              <Progress
                                value={aiAnalysis.marketAnalysis.demandScore}
                                className="h-2.5"
                              />
                              <div className="flex items-center gap-2 text-sm mt-2">
                                <BarChart className="h-4 w-4 text-muted-foreground" />
                                <span>Competition Level: {aiAnalysis.marketAnalysis.competitionLevel}</span>
                              </div>
                            </div>
                          </div>

                          {aiAnalysis.ebayData && (
                            <div className="space-y-4">
                              <h4 className="text-sm font-medium">eBay Performance</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-6 rounded-lg bg-secondary/10">
                                  <div className="text-sm text-muted-foreground mb-2">Sales Volume</div>
                                  <div className="text-2xl font-semibold">{aiAnalysis.ebayData.soldCount}</div>
                                  <div className="text-sm text-muted-foreground mt-2">Items Sold</div>
                                </div>
                                <div className="p-6 rounded-lg bg-secondary/10">
                                  <div className="text-sm text-muted-foreground mb-2">Competition</div>
                                  <div className="text-2xl font-semibold">{aiAnalysis.ebayData.activeListing}</div>
                                  <div className="text-sm text-muted-foreground mt-2">Active Listings</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                </div>
              </ScrollArea>
            </div>
          </Tabs>
        </div>

        {/* Actions Section */}
        <div className="flex-none p-6 border-t bg-muted/5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <Button
                size="default"
                variant="ghost"
                onClick={() => onEdit(product)}
                className="h-10"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                size="default"
                variant="ghost"
                onClick={(e) => handleAction("deleteProduct", e)}
                className="h-10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              {!inWatchlist && (
                <>
                  <Button
                    size="default"
                    variant="ghost"
                    onClick={(e) => handleAction("markAsSold", e)}
                    className="h-10 text-green-600 hover:text-green-700"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Sold
                  </Button>
                  {!product.ebayListingUrl ? (
                    <Button
                      size="default"
                      variant="ghost"
                      onClick={(e) => handleAction("generateEbayListing", e)}
                      disabled={isGeneratingListing}
                      className="h-10 text-blue-600 hover:text-blue-700"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      List on eBay
                    </Button>
                  ) : (
                    <Button
                      size="default"
                      variant="ghost"
                      onClick={() => window.open(product.ebayListingUrl, "_blank")}
                      className="h-10 text-green-600 hover:text-green-700"
                    >
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      View on eBay
                    </Button>
                  )}
                </>
              )}
            </div>
            {inWatchlist ? (
              <Button
                size="lg"
                variant="default"
                onClick={() => setShowConvertDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <ArrowUpRight className="h-5 w-5 mr-2" />
                Add to Inventory
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <ConvertWatchlistDialog
        product={product}
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
      />
    </>
  )
}

export default ProductCard