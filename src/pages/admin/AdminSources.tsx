import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { RefreshCw, Plus, ExternalLink } from "lucide-react";

const AdminSources = () => {
  const queryClient = useQueryClient();
  const [syncUrl, setSyncUrl] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: sources, isLoading } = useQuery({
    queryKey: ["admin-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const toggleSourceMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("sources")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
      toast.success("Status source berhasil diupdate");
    },
    onError: (error) => {
      toast.error("Gagal update source: " + error.message);
    },
  });

  const handleSyncComic = async () => {
    if (!syncUrl || !selectedSource) {
      toast.error("Silakan pilih source dan masukkan URL");
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-comic", {
        body: {
          sourceUrl: syncUrl,
          sourceCode: selectedSource,
        },
      });

      if (error) throw error;

      toast.success(`Berhasil sync komik! ${data.chaptersCount} chapter ditambahkan`);
      setSyncUrl("");
      queryClient.invalidateQueries({ queryKey: ["admin-komik"] });
    } catch (error: any) {
      toast.error("Gagal sync: " + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Scraper Sources</h1>
      </div>

      {/* Sync Comic Form */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Sync Komik dari Source</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Pilih Source</label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">-- Pilih Source --</option>
              {sources?.filter(s => s.is_active).map((source) => (
                <option key={source.id} value={source.code}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">URL Komik</label>
            <Input
              placeholder="https://manhwalist02.site/manga/example-manga/"
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
            />
          </div>

          <Button
            onClick={handleSyncComic}
            disabled={isSyncing || !syncUrl || !selectedSource}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? "Syncing..." : "Sync Komik Sekarang"}
          </Button>
        </div>
      </Card>

      {/* Sources List */}
      <div className="grid gap-4">
        {sources?.map((source) => (
          <Card key={source.id} className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold">{source.name}</h3>
                  <span className="text-xs px-2 py-1 rounded bg-muted">
                    {source.code}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ExternalLink className="h-4 w-4" />
                  <a
                    href={source.base_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {source.base_url}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {source.is_active ? "Active" : "Inactive"}
                  </span>
                  <Switch
                    checked={source.is_active}
                    onCheckedChange={(checked) =>
                      toggleSourceMutation.mutate({
                        id: source.id,
                        isActive: checked,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminSources;
